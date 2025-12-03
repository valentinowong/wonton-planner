import { createContext, useContext } from "react";

export type PlannerStyles = Record<string, any>;

export const PlannerStylesContext = createContext<PlannerStyles | null>(null);

export function usePlannerStyles(): PlannerStyles {
  const value = useContext(PlannerStylesContext);
  if (!value) {
    throw new Error("Planner styles missing");
  }
  return value;
}
