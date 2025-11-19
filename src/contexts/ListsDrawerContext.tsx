import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type LayoutMode = "single" | "all";

type ListsDrawerContextValue = {
  activeListId: string | null;
  setActiveListId: (value: string | null) => void;
  layoutMode: LayoutMode;
  setLayoutMode: (value: LayoutMode) => void;
  triggerCreateList: () => void;
  setCreateListHandler: (handler: (() => void) | null) => void;
};

const ListsDrawerContext = createContext<ListsDrawerContextValue | undefined>(undefined);

export function ListsDrawerProvider({ children }: { children: ReactNode }) {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");
  const [createListHandler, setCreateListHandler] = useState<(() => void) | null>(null);

  const value = useMemo(
    () => ({
      activeListId,
      setActiveListId,
      layoutMode,
      setLayoutMode,
      triggerCreateList: () => {
        createListHandler?.();
      },
      setCreateListHandler: (handler: (() => void) | null) => {
        setCreateListHandler(() => handler ?? null);
      },
    }),
    [activeListId, layoutMode, createListHandler],
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
