import { supabase } from "./client";
import type { LocalTask } from "../../lib/db";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TaskWindowRow = {
  id: string;
  user_id: string;
  list_id: string | null;
  title: string;
  notes: string | null;
  status: "todo" | "doing" | "done" | "canceled";
  due_date: string | null;
  planned_start: string | null;
  planned_end: string | null;
  estimate_minutes: number | null;
  actual_minutes: number | null;
  priority: number | null;
  sort_index: number | null;
  is_recurring: boolean;
  recurrence_id?: string | null;
  occurrence_date?: string | null;
};

export async function fetchTasksWindow(start: string, end: string) {
  const { data, error } = await supabase.rpc("get_tasks_window", {
    _start: start,
    _end: end,
  });
  if (error) throw error;
  return (data ?? []) as TaskWindowRow[];
}

export async function upsertTaskRow(payload: Record<string, unknown>) {
  const body: Record<string, unknown> = { ...payload };
  if (typeof body.id === "string" && !UUID_REGEX.test(body.id)) {
    delete body.id;
  }
  const { data, error } = await supabase.from("tasks").upsert(body).select().maybeSingle();
  if (error) throw error;
  return data as TaskWindowRow | null;
}

export async function deleteTaskRow(taskId: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function countTasksInList(listId: string) {
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteTasksInList(listId: string) {
  const { error } = await supabase.from("tasks").delete().eq("list_id", listId);
  if (error) throw error;
}

export async function moveTasksToList(fromListId: string, toListId: string) {
  const { error } = await supabase.from("tasks").update({ list_id: toListId }).eq("list_id", fromListId);
  if (error) throw error;
}

export function subscribeToTaskEntities(onChange: () => void) {
  const channel = supabase
    .channel("planner-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "recurrences" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "recurrence_occurrences" }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export async function fetchListBacklog(listIds?: string[]) {
  let query = supabase
    .from("tasks")
    .select("*")
    .is("due_date", null)
    .order("sort_index", { ascending: true, nullsFirst: true })
    .order("updated_at", { ascending: false, nullsLast: true });

  if (listIds && listIds.length > 0) {
    query = query.in("list_id", listIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LocalTask[];
}
