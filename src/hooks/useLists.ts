import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchLists as fetchListsApi,
  insertLists,
  upsertList as upsertListApi,
  type ListRow,
} from "../services/api/lists";

export type RemoteList = ListRow;

export function useLists() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;
  const listsQuery = useQuery({ queryKey: ["lists"], queryFn: fetchListsApi, enabled: Boolean(userId) });
  const bootstrappedRef = useRef(false);

  const ensureDefaults = useMutation({
    mutationFn: async ({ currentLists, userId }: { currentLists: RemoteList[] | undefined; userId: string }) => {
      const defaults = [
        { name: "Inbox", sort_index: 0, is_system: true },
        { name: "Today", sort_index: 1, is_system: true },
        { name: "Someday", sort_index: 2, is_system: true },
      ];
      const existingNames = new Set((currentLists ?? []).map((list) => (list.name ?? "").toLowerCase()));
      const payload = defaults
        .filter((item) => !existingNames.has(item.name.toLowerCase()))
        .map((item) => ({ ...item, user_id: userId }));
      await insertLists(payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });

  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (!userId) return;
    if (!listsQuery.isLoading && (listsQuery.data?.length ?? 0) === 0) {
      bootstrappedRef.current = true;
      ensureDefaults.mutate({ currentLists: listsQuery.data, userId });
    }
  }, [listsQuery.data, listsQuery.isLoading, ensureDefaults, userId]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: Partial<RemoteList> & { name: string }) => {
      if (!userId) return;
      await upsertListApi({ user_id: userId, ...payload });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
  });

  return {
    ...listsQuery,
    upsertList: upsertMutation.mutateAsync,
  };
}
