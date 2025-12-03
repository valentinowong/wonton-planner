import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSubtasks as fetchSubtasksApi, upsertSubtaskRow, type SubtaskRow } from "../../../data/remote/subtasksApi";

export type RemoteSubtask = SubtaskRow;

export function useSubtasks(taskId: string) {
  const queryClient = useQueryClient();
  const subtasksQuery = useQuery({
    queryKey: ["subtasks", taskId],
    queryFn: () => fetchSubtasksApi(taskId),
    enabled: Boolean(taskId),
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: Partial<RemoteSubtask> & { task_id: string }) => {
      await upsertSubtaskRow(payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] }),
  });

  return {
    ...subtasksQuery,
    upsertSubtask: upsertMutation.mutateAsync,
  };
}
