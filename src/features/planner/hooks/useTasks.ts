import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queueTaskDeletion, queueTaskMutation, fetchTasksWindow, type TaskWindowRow } from "../../../data/sync";
import type { LocalTask } from "../../../data/local/db";
import { useAuth } from "../../auth/context/AuthContext";

type TaskLike = LocalTask | TaskWindowRow;

function sanitizeTaskPayload(task: TaskLike): LocalTask {
  const maybeLocal = task as Partial<LocalTask>;
  return {
    id: task.id,
    user_id: task.user_id,
    list_id: task.list_id ?? null,
    title: task.title,
    notes: task.notes ?? null,
    status: task.status,
    due_date: task.due_date ?? null,
    planned_start: task.planned_start ?? null,
    planned_end: task.planned_end ?? null,
    estimate_minutes: task.estimate_minutes ?? null,
    actual_minutes: task.actual_minutes ?? null,
    priority: task.priority ?? null,
    sort_index: task.sort_index ?? null,
    updated_at: maybeLocal.updated_at ?? new Date().toISOString(),
    is_recurring: (task as TaskWindowRow).is_recurring ?? maybeLocal.is_recurring ?? false,
    recurrence_id: (task as TaskWindowRow).recurrence_id ?? maybeLocal.recurrence_id ?? null,
    occurrence_date: (task as TaskWindowRow).occurrence_date ?? maybeLocal.occurrence_date ?? null,
    moved_to_date: (task as TaskWindowRow).moved_to_date ?? maybeLocal.moved_to_date ?? null,
  };
}

function toWindowRow(
  task: LocalTask,
  fallback: TaskWindowRow | undefined,
  userIdFallback: string | undefined,
): TaskWindowRow {
  return {
    id: task.id,
    user_id: task.user_id ?? fallback?.user_id ?? userIdFallback ?? "",
    list_id: task.list_id ?? null,
    title: task.title,
    notes: task.notes ?? null,
    status: task.status,
    due_date: task.due_date ?? null,
    planned_start: task.planned_start ?? null,
    planned_end: task.planned_end ?? null,
    estimate_minutes: task.estimate_minutes ?? null,
    actual_minutes: task.actual_minutes ?? null,
    priority: task.priority ?? null,
    sort_index: task.sort_index ?? null,
    is_recurring: fallback?.is_recurring ?? false,
    recurrence_id: fallback?.recurrence_id ?? null,
    occurrence_date: fallback?.occurrence_date ?? null,
  };
}

export function useTasks(start: string, end: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const windowQuery = useQuery<TaskWindowRow[]>({
    queryKey: ["tasks", { start, end }],
    queryFn: () => fetchTasksWindow(start, end),
    enabled: Boolean(start && end),
  });

  const upsert = useMutation({
    mutationFn: async (task: TaskLike) => queueTaskMutation(sanitizeTaskPayload(task)),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", { start, end }] });
      const sanitized = sanitizeTaskPayload(task);
      const previous = queryClient.getQueryData<TaskWindowRow[]>(["tasks", { start, end }]);
      const existing = previous?.find((item) => item.id === sanitized.id);
      const optimisticRow = toWindowRow(sanitized, existing, session?.user.id);
      let optimistic: TaskWindowRow[] = previous ? [...previous] : [];
      if (existing) {
        optimistic = optimistic.map((item) => (item.id === sanitized.id ? { ...item, ...optimisticRow } : item));
      } else {
        optimistic = [...optimistic, optimisticRow];
      }
      queryClient.setQueryData(["tasks", { start, end }], optimistic);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", { start, end }], context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const remove = useMutation({
    mutationFn: async (taskId: string) => queueTaskDeletion(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return {
    ...windowQuery,
    upsertTask: upsert.mutateAsync,
    deleteTask: remove.mutateAsync,
  };
}
