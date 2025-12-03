import { HOUR_BLOCK_HEIGHT } from "../../utils/time";

export const BACKLOG_LIST_HEADER_ID_PREFIX = "backlog-list-header-";
export const BACKLOG_LIST_ZONE_ID_PREFIX = "backlog-list-zone-";

export type PlannerDropTarget =
  | { type: "task"; listId: string; taskId: string; position: "before" | "after"; yFraction?: number }
  | { type: "list"; listId: string }
  | { type: "boardTask"; dayKey: string; taskId: string; position: "before" | "after"; yFraction?: number }
  | { type: "day"; dayKey: string; origin?: "daily" | "taskBoard" }
  | { type: "calendarSlot"; dayKey: string; hour: number };

export type PlannerListHoverTarget = Extract<PlannerDropTarget, { type: "list" | "task" }>;

export function resolvePlannerDropTarget(x: number, y: number, draggingTaskId?: string): PlannerDropTarget | null {
  // React Native Gesture Handler can occasionally emit non-finite coords on web (e.g. NaN
  // right after a drag starts). Guard so DOM APIs don't throw and lock up the UI.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (typeof document === "undefined") return null;
  const pointCandidates: { x: number; y: number }[] = [{ x, y }];
  if (typeof window !== "undefined") {
    const clientX = x - (window.scrollX ?? 0);
    const clientY = y - (window.scrollY ?? 0);
    pointCandidates.push({ x: clientX, y: clientY });
  }

  for (const point of pointCandidates) {
    const candidates =
      typeof document.elementsFromPoint === "function"
        ? (document.elementsFromPoint(point.x, point.y) as (HTMLElement | null)[])
        : [document.elementFromPoint(point.x, point.y) as HTMLElement | null];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const target = resolveDropTargetFromNode(candidate, draggingTaskId ?? null, point.y);
      if (target) {
        return target;
      }
    }
  }
  return null;
}

function resolveDropTargetFromNode(node: HTMLElement, draggingTaskId: string | null, pointerY: number): PlannerDropTarget | null {
  let current: HTMLElement | null = node;
  while (current) {
    const target = current.dataset?.dragTarget ?? current.getAttribute?.("data-drag-target");
    if (target === "backlogTask") {
      const listId = current.dataset?.listId ?? current.getAttribute("data-list-id");
      const taskId = current.dataset?.taskId ?? current.getAttribute("data-task-id");
      if (listId && taskId && taskId !== draggingTaskId) {
        const rect = current.getBoundingClientRect();
        const yFraction = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
        const position: "before" | "after" = yFraction >= 0.5 ? "after" : "before";
        return { type: "task", listId, taskId, position, yFraction };
      }
    } else if (target === "taskBoardTask") {
      const dayKey = current.dataset?.dayKey ?? current.getAttribute("data-day-key");
      const taskId = current.dataset?.taskId ?? current.getAttribute("data-task-id");
      if (dayKey && taskId && taskId !== draggingTaskId) {
        const rect = current.getBoundingClientRect();
        const yFraction = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));
        const position: "before" | "after" = yFraction >= 0.5 ? "after" : "before";
        return { type: "boardTask", dayKey, taskId, position, yFraction };
      }
    } else if (target === "listEntry" || target === "listZone") {
      const listId = current.dataset?.listId ?? current.getAttribute("data-list-id");
      if (listId) {
        return { type: "list", listId };
      }
    } else if (target === "dailyTaskList" || target === "taskColumn") {
      const dayKey = current.dataset?.dayKey ?? current.getAttribute("data-day-key");
      if (dayKey) {
        return { type: "day", dayKey, origin: target === "taskColumn" ? "taskBoard" : "daily" };
      }
    } else if (target === "calendarSlot") {
      const dayKey = current.dataset?.dayKey ?? current.getAttribute("data-day-key");
      const hourString = current.dataset?.hour ?? current.getAttribute("data-hour");
      if (dayKey && hourString) {
        const hour = Number(hourString);
        if (!Number.isNaN(hour)) {
          return { type: "calendarSlot", dayKey, hour };
        }
      }
    } else if (target === "calendarDay") {
      const dayKey = current.dataset?.dayKey ?? current.getAttribute("data-day-key");
      if (dayKey) {
        const rect = current.getBoundingClientRect();
        const relativeY = pointerY - rect.top;
        const slotHeight = HOUR_BLOCK_HEIGHT || 60;
        const hour = Math.max(0, Math.min(23, Math.floor(relativeY / slotHeight)));
        return { type: "calendarSlot", dayKey, hour };
      }
    }
    // Allow dedicated backlog drop rows to behave like task targets (position derived from data attribute).
    if (current.dataset?.dragTarget === "backlogDrop") {
      const listId = current.dataset?.listId ?? current.getAttribute("data-list-id");
      const taskId = current.dataset?.taskId ?? current.getAttribute("data-task-id");
      const positionAttr = current.dataset?.position ?? current.getAttribute("data-position");
      const position: "before" | "after" = positionAttr === "after" ? "after" : "before";
      if (listId && taskId && taskId !== draggingTaskId) {
        return { type: "task", listId, taskId, position, yFraction: 0.5 };
      }
    }
    const domId = current.id ?? current.getAttribute?.("id");
    const listIdFromDomId = resolveListIdFromDomId(domId);
    if (listIdFromDomId) {
      return { type: "list", listId: listIdFromDomId };
    }
    current = current.parentElement;
  }
  return null;
}

function resolveListIdFromDomId(domId?: string | null): string | null {
  if (!domId) return null;
  if (domId.startsWith(BACKLOG_LIST_HEADER_ID_PREFIX)) {
    return domId.slice(BACKLOG_LIST_HEADER_ID_PREFIX.length);
  }
  if (domId.startsWith(BACKLOG_LIST_ZONE_ID_PREFIX)) {
    return domId.slice(BACKLOG_LIST_ZONE_ID_PREFIX.length);
  }
  return null;
}
