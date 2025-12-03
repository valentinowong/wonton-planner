import { QueryClient } from "@tanstack/react-query";
import {
  deleteOutboxItem,
  deleteTask,
  enqueueOutbox,
  getOutbox,
  type LocalTask,
  upsertTask,
} from "../local/db";
import { getSession } from "../remote/authApi";
import {
  deleteTaskRow,
  fetchTasksWindow as fetchTasksWindowApi,
  subscribeToTaskEntities,
  upsertTaskRow,
  upsertRecurrenceOccurrence,
  type TaskWindowRow,
} from "../remote/tasksApi";
import { generateUUID, isUUID } from "../../domain/shared/uuid";

export type { TaskWindowRow };

function dedupeRecurringOccurrences(rows: TaskWindowRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.recurrence_id && row.occurrence_date) {
      const key = `${row.recurrence_id}|${row.occurrence_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });
}

export async function fetchTasksWindow(start: string, end: string) {
  const rows = dedupeRecurringOccurrences(await fetchTasksWindowApi(start, end));
  for (const row of rows) {
    if (!row.is_recurring) {
      await upsertTask(row);
    }
  }
  return rows;
}

export async function queueTaskMutation(task: LocalTask) {
  const session = await getSession();
  const userId = task.user_id ?? session?.user.id;
  if (!userId) throw new Error("Missing authenticated user for task mutation");
  // list_id may be null when unscheduled/backlog; backend handles null via schema defaults or validation.
  // Recurring occurrences are not stored in the tasks table; we update the override table instead.
  if (task.is_recurring && task.recurrence_id && task.occurrence_date) {
    await upsertRecurrenceOccurrence({
      recurrence_id: task.recurrence_id,
      occurrence_date: task.occurrence_date,
      status: task.status,
      title: task.title,
      notes: task.notes ?? null,
      list_id: task.list_id ?? null,
      planned_start: task.planned_start ?? null,
      planned_end: task.planned_end ?? null,
      actual_minutes: task.actual_minutes ?? null,
      moved_to_date: task.moved_to_date ?? null,
    });
    return;
  }

  let payload: LocalTask = { ...task, user_id: userId };
  if (!isUUID(payload.id)) {
    const newId = generateUUID();
    await deleteTask(payload.id);
    payload = { ...payload, id: newId };
  }
  await upsertTask(payload);
  try {
    const result = await upsertTaskRow(payload);
    if (result?.id && result.id !== payload.id) {
      await deleteTask(payload.id);
      payload = { ...payload, id: result.id };
      await upsertTask(payload);
    }
  } catch (error) {
    console.error("queueTaskMutation failed; queued for retry", error);
    await enqueueOutbox("tasks", "upsert", payload);
    throw error;
  }
}

export async function queueTaskDeletion(taskId: string) {
  await deleteTask(taskId);
  try {
    await deleteTaskRow(taskId);
  } catch (error) {
    await enqueueOutbox("tasks", "delete", { id: taskId });
    throw error;
  }
}

export async function pushOutbox() {
  const items = await getOutbox(25);
  for (const item of items) {
    if (item.entity === "tasks") {
      if (item.operation === "upsert") {
        let payload = item.payload as LocalTask;
        if (!isUUID(payload.id)) {
          const newId = generateUUID();
          await deleteTask(payload.id);
          payload = { ...payload, id: newId };
        }
        try {
          await upsertTask(payload);
          const result = await upsertTaskRow(payload);
          if (result?.id && result.id !== payload.id) {
            await deleteTask(payload.id);
            payload = { ...payload, id: result.id };
            await upsertTask(payload);
          }
          await deleteOutboxItem(item.id);
        } catch (error) {
          console.warn("Failed to replay upsert", error);
        }
      } else if (item.operation === "delete") {
        const { id } = item.payload as { id: string };
        if (!isUUID(id)) {
          await deleteTask(id);
          await deleteOutboxItem(item.id);
          continue;
        }
        try {
          await deleteTaskRow(id);
          await deleteOutboxItem(item.id);
        } catch (error) {
          console.warn("Failed to replay delete", error);
        }
      }
    }
  }
}

export function subscribeToRealtime(queryClient: QueryClient) {
  return subscribeToTaskEntities(() => queryClient.invalidateQueries({ queryKey: ["tasks"] }));
}
