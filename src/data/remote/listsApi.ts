import { supabase } from "./client";

export type ListRow = {
  id: string;
  user_id: string;
  name: string;
  sort_index: number;
  is_system: boolean;
};

export async function fetchLists() {
  const { data, error } = await supabase.from("lists").select("*").order("sort_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ListRow[];
}

export async function insertLists(payload: Partial<ListRow>[]) {
  if (!payload.length) return;
  const { error } = await supabase.from("lists").insert(payload);
  if (error) throw error;
}

export async function upsertList(payload: Partial<ListRow> & { name: string }) {
  const { error } = await supabase.from("lists").upsert(payload);
  if (error) throw error;
}

export async function deleteList(listId: string) {
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  if (error) throw error;
}
