import { supabase } from "./client";

export type SubtaskRow = {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  sort_index: number;
};

export async function fetchSubtasks(taskId: string) {
  const { data, error } = await supabase
    .from("subtasks")
    .select("*")
    .eq("task_id", taskId)
    .order("sort_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SubtaskRow[];
}

export async function upsertSubtaskRow(payload: Partial<SubtaskRow> & { task_id: string }) {
  const { error } = await supabase.from("subtasks").upsert(payload);
  if (error) throw error;
}
