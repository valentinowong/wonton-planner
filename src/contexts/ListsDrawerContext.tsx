import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type LayoutMode = "single" | "all";

type ListsDrawerContextValue = {
  activeListId: string | null;
  setActiveListId: (value: string | null) => void;
  layoutMode: LayoutMode;
  setLayoutMode: (value: LayoutMode) => void;
};

const ListsDrawerContext = createContext<ListsDrawerContextValue | undefined>(undefined);

export function ListsDrawerProvider({ children }: { children: ReactNode }) {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");

  const value = useMemo(
    () => ({
      activeListId,
      setActiveListId,
      layoutMode,
      setLayoutMode,
    }),
    [activeListId, layoutMode],
  );

  return <ListsDrawerContext.Provider value={value}>{children}</ListsDrawerContext.Provider>;
}

export function useListsDrawer() {
  const context = useContext(ListsDrawerContext);
  if (!context) {
    throw new Error("useListsDrawer must be used within a ListsDrawerProvider");
  }
  return context;
}
