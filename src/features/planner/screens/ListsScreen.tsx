import { Feather } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import type { PostgrestError } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LocalTask } from "../../../data/local/db";
import { deleteList as deleteListRow } from "../../../data/remote/listsApi";
import { inviteToListShare, revokeShare } from "../../../data/remote/sharesApi";
import {
  countTasksInList,
  deleteHistoryEntry,
  deleteTasksInList,
  fetchLatestHistory,
  fetchListBacklog,
  logAssignmentHistory,
  logTaskHistory,
  moveTasksToList,
  type TaskWindowRow,
} from "../../../data/remote/tasksApi";
import { queueTaskDeletion, queueTaskMutation } from "../../../data/sync";
import { generateUUID } from "../../../domain/shared/uuid";
import type { ThemeColors } from "../../../theme";
import { useTheme } from "../../../theme/ThemeContext";
import { useAuth } from "../../auth/context/AuthContext";
import type { PlannerListHoverTarget } from "../components/drag/dropTargets";
import {
  PlannerCreateListModal,
  PlannerDeleteListModal,
  PlannerFiltersModal,
  PlannerListSettingsModal,
  PlannerNotificationsModal,
  PlannerSettingsModal,
  PlannerTaskDetailModal,
} from "../components/modals";
import { PlannerBacklogPanel } from "../components/PlannerBacklogPanel";
import { PlannerDailySchedulePanel, PlannerDailyTaskPanel } from "../components/PlannerDailyPanels";
import { PlannerHero } from "../components/PlannerHero";
import { PlannerTaskBoard } from "../components/PlannerTaskBoard";
import { PlannerWeekCalendarGrid } from "../components/PlannerWeekCalendarGrid";
import { useListMembers } from "../hooks/useListMembers";
import type { RemoteList } from "../hooks/useLists";
import { useLists } from "../hooks/useLists";
import { useNotifications } from "../hooks/useNotifications";
import { usePendingInvites } from "../hooks/usePendingInvites";
import { useTasks } from "../hooks/useTasks";
import { useListsDrawer } from "../state/ListsDrawerContext";
import { PlannerStylesContext } from "../state/PlannerStylesContext";
import type { DeleteAction, PlannerDay, PlannerDragPreview, PlannerViewMode } from "../types";
import type { AssigneeFilterValue, PlannerFiltersState } from "../types/filters";
import { CALENDAR_DAY_WIDTH, DAY_COLUMN_WIDTH, HOUR_BLOCK_HEIGHT } from "../utils/time";

type UndoAction =
  | { kind: "update"; before: LocalTask; after: LocalTask; label: string; historyId?: string }
  | { kind: "add"; after: LocalTask; label: string; historyId?: string }
  | { kind: "delete"; before: LocalTask; label: string; historyId?: string };

function formatDateKey(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatRangeLabel(start?: PlannerDay, end?: PlannerDay) {
  if (!start || !end) return "";
  return `${start.monthText} ${start.dayNumber} – ${end.monthText} ${end.dayNumber}`;
}

function startOfWeek(date: Date, weekStart: "sunday" | "monday") {
  const startDay = weekStart === "sunday" ? 0 : 1;
  const current = date.getDay();
  const diff = (current - startDay + 7) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function buildPlannerDays(offset: number, count: number, weekStart?: "sunday" | "monday"): PlannerDay[] {
  const today = new Date();
  const base = weekStart ? startOfWeek(today, weekStart) : today;
  base.setHours(0, 0, 0, 0);
  const start = new Date(base);
  start.setDate(start.getDate() + offset * count);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: formatDateKey(date),
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
      monthText: date.toLocaleDateString(undefined, { month: "short" }),
      dayNumber: date.getDate().toString().padStart(2, "0"),
      dateObj: date,
    };
  });
}

function cloneTask(task: LocalTask): LocalTask {
  return { ...task };
}

function findTaskById(fromBacklog: Record<string, LocalTask[]>, fromScheduled: Record<string, LocalTask[]>, id: string): LocalTask | null {
  for (const listId of Object.keys(fromBacklog)) {
    const hit = fromBacklog[listId]?.find((t) => t.id === id);
    if (hit) return hit;
  }
  for (const dayKey of Object.keys(fromScheduled)) {
    const hit = fromScheduled[dayKey]?.find((t) => t.id === id);
    if (hit) return hit;
  }
  return null;
}

function buildPlannerDayRange(startOffset: number, endOffset: number): PlannerDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: endOffset - startOffset + 1 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + startOffset + index);
    return {
      key: formatDateKey(date),
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
      monthText: date.toLocaleDateString(undefined, { month: "short" }),
      dayNumber: date.getDate().toString().padStart(2, "0"),
      dateObj: date,
    };
  });
}


function rowToLocalTask(row: TaskWindowRow): LocalTask {
  return {
    id: row.id,
    user_id: row.user_id,
    list_id: row.list_id ?? null,
    assignee_id: row.assignee_id ?? null,
    assignee_display_name: row.assignee_display_name ?? null,
    assignee_email: row.assignee_email ?? null,
    title: row.title,
    notes: row.notes,
    status: row.status,
    due_date: row.due_date,
    planned_start: row.planned_start,
    planned_end: row.planned_end,
    estimate_minutes: row.estimate_minutes,
    actual_minutes: row.actual_minutes,
    priority: row.priority,
    sort_index: row.sort_index,
    is_recurring: row.is_recurring,
    recurrence_id: row.recurrence_id ?? null,
    occurrence_date: row.occurrence_date ?? null,
    moved_to_date: row.moved_to_date ?? null,
  };
}

export default function ListsScreen() {
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const patchTaskDetailCache = useCallback(
    (updated: LocalTask) => {
      const key = ["task", updated.id];
      const existing = queryClient.getQueryData<LocalTask>(key);
      if (!existing) return;
      queryClient.setQueryData(key, { ...existing, ...updated });
    },
    [queryClient],
  );
  const patchTasksCache = useCallback(
    (updated: LocalTask) => {
      const next = (row: TaskWindowRow): TaskWindowRow => ({
        ...row,
        list_id: updated.list_id ?? null,
        due_date: updated.due_date ?? null,
        planned_start: updated.planned_start ?? null,
        planned_end: updated.planned_end ?? null,
        sort_index: updated.sort_index ?? null,
        status: (updated.status as TaskWindowRow["status"]) ?? row.status,
        title: updated.title ?? row.title,
        notes: updated.notes ?? row.notes ?? null,
        estimate_minutes: updated.estimate_minutes ?? row.estimate_minutes ?? null,
        priority: updated.priority ?? row.priority ?? null,
        actual_minutes: updated.actual_minutes ?? row.actual_minutes ?? null,
      });
      const queries = queryClient.getQueriesData<TaskWindowRow[]>({ queryKey: ["tasks"] });
      queries.forEach(([key, data]) => {
        if (!data) return;
        const hasTask = data.some((row) => row.id === updated.id);
        if (!hasTask) return;
        const patched = data.map((row) => (row.id === updated.id ? next(row) : row));
        queryClient.setQueryData(key, patched);
      });
    },
    [queryClient],
  );
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1280;
  const daysPerView = isDesktop ? 7 : 3;
  const [calendarStart, setCalendarStart] = useState<"sunday" | "monday">("monday");

  const { data: lists, isLoading: listsLoading, upsertList } = useLists();
  const { activeListId, setActiveListId } = useListsDrawer();
  const notifications = useNotifications();
  const pendingInvites = usePendingInvites();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateDialogMessage, setDuplicateDialogMessage] = useState(
    "You already have a list with that name. Please choose a different name.",
  );
  const [viewMode, setViewMode] = useState<PlannerViewMode>("tasks");
  const [filters, setFilters] = useState<PlannerFiltersState>({
    assignee: "me",
    status: "all",
    planned: "all",
  });
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [showAllLists, setShowAllLists] = useState(true);
  const [plannerOffset, setPlannerOffset] = useState(0);
  const plannerDays = useMemo(
    () => buildPlannerDays(plannerOffset, daysPerView, viewMode === "calendar" ? calendarStart : undefined),
    [plannerOffset, daysPerView, calendarStart, viewMode],
  );
  const calendarRangeLabel = useMemo(
    () => formatRangeLabel(plannerDays[0], plannerDays[plannerDays.length - 1]),
    [plannerDays],
  );
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [listSettingsTarget, setListSettingsTarget] = useState<RemoteList | null>(null);

  const earliestWeek = plannerOffset - 1;
  const latestWeek = plannerOffset + 1;
  const rangeStartDays = buildPlannerDays(earliestWeek, daysPerView);
  const rangeEndDays = buildPlannerDays(latestWeek, daysPerView);
  const currentStartKey = plannerDays[0]?.key ?? todayKey;
  const currentEndKey = plannerDays[plannerDays.length - 1]?.key ?? currentStartKey;
  const rangeStartKey = rangeStartDays[0]?.key ?? currentStartKey;
  const rangeEndKey = rangeEndDays[rangeEndDays.length - 1]?.key ?? currentEndKey;

  const { data: scheduledRows, upsertTask: upsertScheduledTask } = useTasks(rangeStartKey, rangeEndKey);
  const [selectedDayKey, setSelectedDayKey] = useState(currentStartKey);
  const [railDayKey, setRailDayKey] = useState(currentStartKey);
  const [pendingTask, setPendingTask] = useState<LocalTask | null>(null);
  const [backlogDayHoverKey, setBacklogDayHoverKey] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<PlannerDragPreview | null>(null);
  const [calendarPreview, setCalendarPreview] = useState<{ task: LocalTask; dayKey: string; startMinutes: number } | null>(null);
  const [backlogHoverOverride, setBacklogHoverOverride] = useState<PlannerListHoverTarget | null>(null);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const [undoBusy, setUndoBusy] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const recordHistory = useCallback(
    async (
      entry: { action: string; taskId: string; before?: Partial<LocalTask> | null; after?: Partial<LocalTask> | null },
      options?: { clearRedo?: boolean },
    ) => {
      await logTaskHistory(entry);
      setHasHistory(true);
      if (options?.clearRedo !== false) {
        setRedoStack([]);
      }
    },
    [],
  );

  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]);
    setHasHistory(true);
  }, []);

  const orderedLists = useMemo(() => {
    if (!lists) return [];
    let inbox: RemoteList | null = null;
    const rest: RemoteList[] = [];
    lists.forEach((list) => {
      const isInboxName = (list.name ?? "").toLowerCase() === "inbox";
      const isInboxCandidate = isInboxName || list.is_system;
      if (isInboxCandidate) {
        if (!inbox) {
          inbox = list;
        }
        // Skip additional inbox/system rows to avoid duplicates in UI.
        return;
      }
      rest.push(list);
    });
    return inbox ? [inbox, ...rest] : rest;
  }, [lists]);
  const activeList = useMemo(
    () => orderedLists.find((list) => list.id === activeListId) ?? null,
    [activeListId, orderedLists],
  );
  const inboxList = orderedLists[0];
  const backlogListIds = useMemo(() => orderedLists.map((list) => list.id), [orderedLists]);
  const { memberByUserId: sharedMemberLookup } = useListMembers(backlogListIds);
  const { activeMembers: sharedMembers } = useListMembers(backlogListIds);
  const assigneeOptions = useMemo(() => {
    const options: { label: string; value: AssigneeFilterValue }[] = [
      { label: "All assignees", value: "all" },
      { label: "Just me", value: "me" },
      { label: "Unassigned", value: "unassigned" },
    ];
    const seen = new Set<string>();
    sharedMembers
      .filter((member) => member.user_id && member.user_id !== currentUserId)
      .forEach((member) => {
        if (!member.user_id || seen.has(member.user_id)) return;
        seen.add(member.user_id);
        const label =
          member.display_name ||
          member.email ||
          (member.user_id === currentUserId ? "You" : "Collaborator");
        options.push({ label, value: `user:${member.user_id}` });
      });
    return options;
  }, [sharedMembers, currentUserId]);
  const backlogQuery = useQuery({
    queryKey: ["backlog", backlogListIds.join("|")],
    queryFn: () => fetchListBacklog(backlogListIds.length ? backlogListIds : undefined),
    enabled: backlogListIds.length > 0,
  });
  const undeletableListId = inboxList?.id ?? null;
  const backlogByList = useMemo(() => {
    const bucket: Record<string, LocalTask[]> = {};
    orderedLists.forEach((list) => {
      bucket[list.id] = [];
    });
    const fallbackListId = orderedLists[0]?.id ?? null;
    (backlogQuery.data ?? []).forEach((task) => {
      const targetListId = task.list_id ?? fallbackListId;
      if (!targetListId) return;
      const member = task.assignee_id ? sharedMemberLookup[task.assignee_id] : undefined;
      const displayName = member?.display_name ?? task.assignee_display_name ?? null;
      const email = member?.email ?? task.assignee_email ?? null;
      const enrichedTask =
        displayName || email
          ? { ...task, assignee_display_name: displayName ?? null, assignee_email: email }
          : task;
      bucket[targetListId] = bucket[targetListId] ?? [];
      bucket[targetListId].push(enrichedTask);
    });
    return bucket;
  }, [orderedLists, backlogQuery.data, sharedMemberLookup]);

  const handleDropPendingIntoDay = useCallback(
    async (dayKey: string) => {
    if (!pendingTask) return;
      const before = cloneTask(pendingTask);
      const after = {
        ...pendingTask,
        list_id: pendingTask.list_id ?? null,
        due_date: dayKey,
        planned_start: null,
        planned_end: null,
        assignee_id: pendingTask.assignee_id ?? currentUserId,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Scheduled task" });
      patchTasksCache(after);
      patchTaskDetailCache(after);
      if ((before.assignee_id ?? null) !== (after.assignee_id ?? null)) {
        await logAssignmentHistory({
          taskId: after.id,
          previousAssigneeId: before.assignee_id ?? null,
          newAssigneeId: after.assignee_id ?? null,
          note: "Auto-assigned when scheduling",
        });
      }
      await queueTaskMutation(after);
      setPendingTask(null);
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      recordHistory({ action: "schedule_day", taskId: after.id, before, after });
    },
    [patchTaskDetailCache, patchTasksCache, pendingTask, queryClient, pushUndo, recordHistory],
  );

  const handleDropPendingIntoSlot = useCallback(
    async (dayKey: string, hour: number) => {
      if (!pendingTask) return;
      const start = new Date(`${dayKey}T${hour.toString().padStart(2, "0")}:00:00`);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      const before = cloneTask(pendingTask);
      const after = {
        ...pendingTask,
        list_id: pendingTask.list_id ?? null,
        due_date: dayKey,
        planned_start: start.toISOString(),
        planned_end: end.toISOString(),
        assignee_id: pendingTask.assignee_id ?? currentUserId,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Scheduled task" });
      patchTasksCache(after);
      patchTaskDetailCache(after);
      if ((before.assignee_id ?? null) !== (after.assignee_id ?? null)) {
        await logAssignmentHistory({
          taskId: after.id,
          previousAssigneeId: before.assignee_id ?? null,
          newAssigneeId: after.assignee_id ?? null,
          note: "Auto-assigned when scheduling",
        });
      }
      await queueTaskMutation(after);
      recordHistory({ action: "schedule_slot", taskId: after.id, before, after });
      setPendingTask(null);
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    [patchTaskDetailCache, patchTasksCache, pendingTask, queryClient, pushUndo, recordHistory],
  );

  const [showBacklog, setShowBacklog] = useState(true);
  const [showTimebox, setShowTimebox] = useState(isDesktop);
  const [taskDetail, setTaskDetail] = useState<LocalTask | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<"success" | "error">("success");
  const taskBoardRef = useRef<FlashListType<PlannerDay> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RemoteList | null>(null);
  const [deleteTaskCount, setDeleteTaskCount] = useState<number | null>(null);
  const [checkingDeleteTasks, setCheckingDeleteTasks] = useState(false);
  const [deletingList, setDeletingList] = useState(false);
  const todayKey = formatDateKey(new Date());
  const [taskDayWindow, setTaskDayWindow] = useState(() => ({
    start: -daysPerView * 2,
    end: daysPerView * 2,
  }));
  const taskDays = useMemo(() => buildPlannerDayRange(taskDayWindow.start, taskDayWindow.end), [taskDayWindow]);
  const [taskBoardFocusKey, setTaskBoardFocusKey] = useState(todayKey);
  const [taskBoardRangeLabel, setTaskBoardRangeLabel] = useState<string | null>(null);

  const showToast = useCallback((message: string, variant: "success" | "error" = "success") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    setToastVariant(variant);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const findInviteById = useCallback(
    (shareId: string) => (pendingInvites.data ?? []).find((invite) => invite.id === shareId) ?? null,
    [pendingInvites.data],
  );

  const markInviteNotificationRead = useCallback(
    async (shareId: string) => {
      const related = (notifications.data ?? []).find(
        (item) => item.kind === "share_invited" && (item.payload as any)?.share_id === shareId,
      );
      if (related && !related.read_at) {
        try {
          await notifications.markRead(related.id);
        } catch (err) {
          console.warn("Failed to mark invite notification read", err);
        }
      }
    },
    [notifications.data, notifications.markRead],
  );

  const handleAcceptInvite = useCallback(
    async (shareId: string) => {
      const invite = findInviteById(shareId);
      if (!invite) return;
      try {
        await pendingInvites.acceptInvite(invite);
        await markInviteNotificationRead(invite.id);
        showToast("Added to list");
      } catch (err: any) {
        const code = err?.code ?? err?.status;
        const message =
          code === "PGRST301" || code === "PGRST116" || code === 403 || code === 404
            ? "Invite no longer valid."
            : "Could not accept invite.";
        showToast(message, "error");
      }
    },
    [findInviteById, markInviteNotificationRead, pendingInvites, showToast],
  );

  const handleDeclineInvite = useCallback(
    async (shareId: string) => {
      const invite = findInviteById(shareId);
      if (!invite) return;
      try {
        await pendingInvites.declineInvite(invite);
        await markInviteNotificationRead(invite.id);
        showToast("Invite declined");
      } catch (err: any) {
        const code = err?.code ?? err?.status;
        const message =
          code === "PGRST301" || code === "PGRST116" || code === 403 || code === 404
            ? "Invite no longer valid."
            : "Could not decline invite.";
        showToast(message, "error");
      }
    },
    [findInviteById, markInviteNotificationRead, pendingInvites, showToast],
  );

  useEffect(() => {
    const targetStart = plannerOffset * daysPerView - daysPerView * 2;
    const targetEnd = targetStart + daysPerView * 4;
    setTaskDayWindow((window) => ({
      start: Math.min(window.start, targetStart),
      end: Math.max(window.end, targetEnd),
    }));
  }, [plannerOffset, daysPerView]);


  const extendTaskDays = useCallback(
    (direction: "past" | "future") => {
      setTaskDayWindow((window) =>
        direction === "past"
          ? { start: window.start - daysPerView, end: window.end }
          : { start: window.start, end: window.end + daysPerView },
      );
    },
    [daysPerView],
  );

  const userEmail = session?.user.email ?? "demo@wonton.app";
  useEffect(() => {
    setShowTimebox(isDesktop);
  }, [isDesktop]);


  useEffect(() => {
    setDragPreview(null);
  }, [viewMode]);

  useEffect(() => {
    (async () => {
      const latest = await fetchLatestHistory({ skipUndoRedo: true });
      setHasHistory(Boolean(latest));
    })();
  }, []);

  const inboxListId = inboxList?.id ?? null;

  useEffect(() => {
    if (!activeListId && inboxListId) {
      setActiveListId(inboxListId);
    }
  }, [activeListId, inboxListId, setActiveListId]);

  useEffect(() => {
    if (!plannerDays.find((day) => day.key === selectedDayKey)) {
      setSelectedDayKey(plannerDays[0]?.key ?? currentStartKey);
    }
  }, [plannerDays, selectedDayKey, currentStartKey]);

  useEffect(() => {
    const hasRailDay = plannerDays.some((day) => day.key === railDayKey);
    if (!hasRailDay) {
      setRailDayKey(plannerDays[0]?.key ?? currentStartKey);
      return;
    }
    if (viewMode === "calendar") {
      setRailDayKey(selectedDayKey);
    }
  }, [plannerDays, railDayKey, selectedDayKey, currentStartKey, viewMode]);

  const filteredScheduledRows = useMemo(() => {
    const selectedAssigneeId =
      filters.assignee === "me"
        ? currentUserId
        : filters.assignee.startsWith("user:")
        ? filters.assignee.slice("user:".length)
        : null;
    return (scheduledRows ?? []).filter((row) => {
      if (filters.assignee === "me") {
        const assigneeOk = row.assignee_id === currentUserId || (!row.assignee_id && row.user_id === currentUserId);
        if (!assigneeOk) return false;
      } else if (filters.assignee === "unassigned") {
        if (row.assignee_id) return false;
      } else if (filters.assignee !== "all") {
        if (row.assignee_id !== selectedAssigneeId) return false;
      }
      if (filters.status === "todo" && row.status === "done") return false;
      if (filters.status === "done" && row.status !== "done") return false;
      const hasPlan = Boolean(row.planned_start || row.planned_end);
      if (filters.planned === "scheduled" && !hasPlan) return false;
      if (filters.planned === "unscheduled" && hasPlan) return false;
      if (!showAllLists && activeListId) {
        if (row.list_id !== activeListId) return false;
      }
      return true;
    });
  }, [scheduledRows, filters, currentUserId, activeListId, showAllLists]);

  const scheduledByDay = useMemo(() => {
    const bucket: Record<string, LocalTask[]> = {};
    taskDays.forEach((day) => {
      bucket[day.key] = bucket[day.key] ?? [];
    });
    filteredScheduledRows.forEach((row) => {
      if (row.due_date) {
        bucket[row.due_date] = bucket[row.due_date] ?? [];
        bucket[row.due_date].push(rowToLocalTask(row));
      }
    });
    return bucket;
  }, [taskDays, filteredScheduledRows]);

  const selectedDay = taskDays.find((day) => day.key === selectedDayKey) ?? taskDays[0];
  const resolvedSelectedDayKey = selectedDay?.key ?? taskDays[0]?.key ?? currentStartKey;
  const selectedDayTasks = selectedDay ? scheduledByDay[selectedDay.key] ?? [] : [];
  const railDay = plannerDays.find((day) => day.key === railDayKey) ?? plannerDays[0];
  const railDayTasks = railDay ? scheduledByDay[railDay.key] ?? [] : [];
  const railDayIndex = plannerDays.findIndex((day) => day.key === (railDay?.key ?? ""));
  const selectedDayIndex = plannerDays.findIndex((day) => day.key === (selectedDay?.key ?? ""));
  const railCanPrev = railDayIndex > 0;
  const railCanNext = railDayIndex >= 0 && railDayIndex < plannerDays.length - 1;
  const selectedCanPrev = selectedDayIndex > 0;
  const selectedCanNext = selectedDayIndex >= 0 && selectedDayIndex < plannerDays.length - 1;
  const calendarGridHeight = Math.max(isDesktop ? 640 : 480, height - (isDesktop ? 320 : 240));
  const fallbackTaskRangeLabel = useMemo(() => {
    if (!taskDays.length) return "";
    const focusIndex = taskDays.findIndex((day) => day.key === taskBoardFocusKey);
    const safeIndex = focusIndex >= 0 ? focusIndex : 0;
    const halfWindow = Math.floor(daysPerView / 2);
    let startIndex = Math.max(0, safeIndex - halfWindow);
    let endIndex = Math.min(taskDays.length - 1, startIndex + daysPerView - 1);
    if (endIndex - startIndex + 1 < daysPerView) {
      startIndex = Math.max(0, endIndex - (daysPerView - 1));
    }
    return formatRangeLabel(taskDays[startIndex], taskDays[endIndex]);
  }, [taskDays, taskBoardFocusKey, daysPerView]);
  const heroRangeLabel =
    viewMode === "tasks"
      ? taskBoardRangeLabel ?? (fallbackTaskRangeLabel || calendarRangeLabel)
      : calendarRangeLabel;

  function stepRailDay(delta: number) {
    if (railDayIndex < 0) return;
    const nextIndex = railDayIndex + delta;
    if (nextIndex < 0 || nextIndex >= plannerDays.length) return;
    setRailDayKey(plannerDays[nextIndex].key);
  }

  function stepSelectedDay(delta: number) {
    if (selectedDayIndex < 0) return;
    const nextIndex = selectedDayIndex + delta;
    if (nextIndex < 0 || nextIndex >= plannerDays.length) return;
    setSelectedDayKey(plannerDays[nextIndex].key);
  }

  function handleShiftWeek(delta: number) {
    if (viewMode === "tasks") {
      const currentIndex = taskDays.findIndex((day) => day.key === taskBoardFocusKey);
      const safeIndex = currentIndex >= 0 ? currentIndex : taskDays.findIndex((day) => day.key === todayKey);
      if (safeIndex < 0) return;
      const targetIndex = Math.min(Math.max(safeIndex + delta * daysPerView, 0), taskDays.length - 1);
      const nextKey = taskDays[targetIndex]?.key;
      if (nextKey) {
        setTaskBoardFocusKey(nextKey);
        scrollTaskBoardToDay(nextKey);
      }
      return;
    }
    setPlannerOffset((value) => value + delta);
  }

  const scrollTaskBoardToDay = useCallback(
    (dayKey: string) => {
      const index = taskDays.findIndex((day) => day.key === dayKey);
      if (index < 0) return;
      requestAnimationFrame(() => {
        taskBoardRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      });
    },
    [taskDays],
  );

  const handleTaskBoardVisibleRangeChange = useCallback((start: PlannerDay | null, end: PlannerDay | null) => {
    if (!start || !end) return;
    const label = formatRangeLabel(start, end);
    setTaskBoardRangeLabel((prev) => (prev === label ? prev : label));
  }, []);

  useEffect(() => {
    if (!taskDays.length) return;
    if (!taskDays.some((day) => day.key === taskBoardFocusKey)) {
      const fallbackKey = taskDays.find((day) => day.key === todayKey)?.key ?? taskDays[0]?.key;
      if (fallbackKey) {
        setTaskBoardFocusKey(fallbackKey);
        scrollTaskBoardToDay(fallbackKey);
      }
    }
  }, [taskDays, taskBoardFocusKey, todayKey, scrollTaskBoardToDay]);

  useEffect(() => {
    if (viewMode === "tasks") {
      scrollTaskBoardToDay(taskBoardFocusKey);
    }
  }, [viewMode, taskBoardFocusKey, scrollTaskBoardToDay]);

  function handleResetToToday() {
    setPlannerOffset(0);
    setSelectedDayKey(todayKey);
    setRailDayKey(todayKey);
    if (viewMode === "tasks") {
      setTaskBoardFocusKey(todayKey);
      scrollTaskBoardToDay(todayKey);
    }
  }

  function handleCloseDeleteModal() {
    if (deletingList) return;
    setDeleteTarget(null);
    setDeleteTaskCount(null);
  }

  async function handleRequestDeleteList(list: RemoteList) {
    setDeleteTarget(list);
    setDeleteTaskCount(null);
    setCheckingDeleteTasks(true);
    try {
      const count = await countTasksInList(list.id);
      setDeleteTaskCount(count);
    } catch (error) {
      Alert.alert("Unable to load list tasks", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setCheckingDeleteTasks(false);
    }
  }

  async function handleConfirmDeleteList(action: DeleteAction, targetListId?: string | null) {
    if (!deleteTarget) return;
    setDeletingList(true);
    try {
      const hasTasks = (deleteTaskCount ?? 0) > 0;
      if (hasTasks) {
        if (action === "move_inbox") {
          if (!inboxList) throw new Error("Inbox list not found.");
          await moveTasksToList(deleteTarget.id, inboxList.id);
        } else if (action === "move_other") {
          if (!targetListId) throw new Error("Choose a list to move tasks into.");
          await moveTasksToList(deleteTarget.id, targetListId);
        } else {
          await deleteTasksInList(deleteTarget.id);
        }
      }
      await deleteListRow(deleteTarget.id);
      if (activeListId === deleteTarget.id) {
        const fallbackId =
          (inboxList && inboxList.id !== deleteTarget.id ? inboxList.id : null) ??
          orderedLists.find((list) => list.id !== deleteTarget.id)?.id ??
          null;
        setActiveListId(fallbackId);
      }
      setDeleteTarget(null);
      setDeleteTaskCount(null);
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      Alert.alert("Unable to delete list", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setDeletingList(false);
    }
  }

  async function handleCreateList(name: string) {
    if (!name.trim()) return;
    const normalized = name.trim().toLowerCase();
    const ownsListWithSameName = (lists ?? []).some(
      (list) => list.user_id === currentUserId && (list.name ?? "").trim().toLowerCase() === normalized,
    );
    if (ownsListWithSameName) {
      setDuplicateDialogMessage("You already have a list with that name. Please choose a different name.");
      setDuplicateDialogOpen(true);
      return;
    }
    try {
      setCreatingList(true);
      await upsertList({
        id: generateUUID(),
        name: name.trim(),
        sort_index: orderedLists.length + 1,
        is_system: false,
      });
      setCreateModalOpen(false);
      setNewListName("");
    } catch (error) {
      const pgError = error as PostgrestError;
      const message = typeof pgError?.message === "string" ? pgError.message : null;
      const isDuplicate =
        (pgError?.code === "23505" && (message?.includes("lists_owner_name_unique") ?? true)) ||
        (message?.toLowerCase().includes("duplicate key value") ?? false);

      if (isDuplicate) {
        setDuplicateDialogMessage("You already have a list with that name. Please choose a different name.");
        setDuplicateDialogOpen(true);
      } else {
        Alert.alert("Unable to create list", message ?? "Please try again shortly.");
      }
    } finally {
      setCreatingList(false);
    }
  }

  async function handleAddBacklogTask(listId: string, title: string) {
    if (!title.trim()) return;
    const newTask: LocalTask = {
      id: generateUUID(),
      list_id: listId,
      title: title.trim(),
      status: "todo",
      due_date: null,
    };
    pushUndo({ kind: "add", after: newTask, label: "Added task" });
    await queueTaskMutation(newTask);
    recordHistory({ action: "add", taskId: newTask.id, before: null, after: newTask });
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
  }

  async function handleToggleBacklogTask(task: LocalTask) {
    const before = cloneTask(task);
    const after = { ...task, status: task.status === "done" ? "todo" : "done", updated_at: new Date().toISOString() };
    pushUndo({ kind: "update", before, after, label: after.status === "done" ? "Marked done" : "Marked todo" });
    await queueTaskMutation(after);
    recordHistory({ action: "toggle", taskId: task.id, before, after });
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
  }

  const handleMoveBacklogTask = useCallback(
    async (task: LocalTask, listId: string) => {
      if (task.list_id === listId) return;
      const before = cloneTask(task);
      const after = {
        ...task,
        list_id: listId,
        due_date: null,
        planned_start: null,
        planned_end: null,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Moved task" });
      await queueTaskMutation(after);
      recordHistory({ action: "move_backlog", taskId: task.id, before, after });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
    },
    [queryClient, pushUndo, recordHistory],
  );

  const handleReorderBacklogTaskDirect = useCallback(
    async (task: LocalTask, listId: string, targetTaskId: string | null, position: "before" | "after") => {
      const listTasks = (backlogByList[listId] ?? []).filter((candidate) => candidate.id !== task.id);
      const nextSortIndex = computeBacklogSortIndex(listTasks, targetTaskId, position);
      const before = cloneTask(task);
      const after = {
        ...task,
        list_id: listId,
        due_date: null,
        planned_start: null,
        planned_end: null,
        sort_index: nextSortIndex,
        moved_to_date: task.is_recurring ? null : task.moved_to_date ?? null,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Reordered task" });
      await queueTaskMutation(after);
      recordHistory({ action: "reorder_backlog", taskId: task.id, before, after });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
    },
    [backlogByList, queryClient, pushUndo, recordHistory],
  );

  const handleAssignBacklogTaskToDay = useCallback(
    async (task: LocalTask, dayKey: string) => {
      const before = cloneTask(task);
      const nextAssignee = task.assignee_id ?? currentUserId;
      const after = {
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        planned_start: null,
        planned_end: null,
        assignee_id: nextAssignee,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Scheduled task" });
      patchTasksCache(after);
      patchTaskDetailCache(after);
      if ((before.assignee_id ?? null) !== (after.assignee_id ?? null)) {
        await logAssignmentHistory({
          taskId: task.id,
          previousAssigneeId: before.assignee_id ?? null,
          newAssigneeId: after.assignee_id ?? null,
          note: "Auto-assigned when scheduling",
        });
      }
      await queueTaskMutation(after);
      recordHistory({ action: "schedule_day", taskId: task.id, before, after });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    [currentUserId, patchTaskDetailCache, patchTasksCache, queryClient, pushUndo, recordHistory],
  );

  const handleAssignBacklogTaskToSlot = useCallback(
    async (task: LocalTask, dayKey: string, hour: number) => {
      const start = new Date(`${dayKey}T${hour.toString().padStart(2, "0")}:00:00`);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      const before = cloneTask(task);
      const nextAssignee = task.assignee_id ?? currentUserId;
      const after = {
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        planned_start: start.toISOString(),
        planned_end: end.toISOString(),
        assignee_id: nextAssignee,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Scheduled task" });
      patchTasksCache(after);
      patchTaskDetailCache(after);
      if ((before.assignee_id ?? null) !== (after.assignee_id ?? null)) {
        await logAssignmentHistory({
          taskId: task.id,
          previousAssigneeId: before.assignee_id ?? null,
          newAssigneeId: after.assignee_id ?? null,
          note: "Auto-assigned when scheduling",
        });
      }
      await queueTaskMutation(after);
      recordHistory({ action: "schedule_slot", taskId: task.id, before, after });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [currentUserId, patchTaskDetailCache, patchTasksCache, queryClient, pushUndo, recordHistory],
  );

  async function handleAddScheduledTask(dayKey: string, title: string) {
    if (!title.trim()) return;
    const newTask: LocalTask = {
      id: generateUUID(),
      list_id: activeListId ?? null,
      title: title.trim(),
      status: "todo",
      due_date: dayKey,
      assignee_id: currentUserId,
    };
    pushUndo({ kind: "add", after: newTask, label: "Added task" });
    await queueTaskMutation(newTask);
    recordHistory({ action: "add", taskId: newTask.id, before: null, after: newTask });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function handleToggleScheduledTask(task: LocalTask) {
    const before = cloneTask(task);
    const after = { ...task, status: task.status === "done" ? "todo" : "done", updated_at: new Date().toISOString() };
    pushUndo({ kind: "update", before, after, label: after.status === "done" ? "Marked done" : "Marked todo" });
    await upsertScheduledTask(after);
    recordHistory({ action: "toggle", taskId: task.id, before, after });
  }

  function handleBeginSchedule(task: LocalTask) {
    setPendingTask(task);
    setViewMode("calendar");
  }

  const handleBacklogListHoverChange = useCallback((target: PlannerListHoverTarget | null) => {
    setBacklogHoverOverride(target);
  }, []);

  const handleBacklogDayHoverChange = useCallback((dayKey: string | null) => {
    setBacklogDayHoverKey(dayKey);
  }, []);

  const handleUndo = useCallback(async () => {
    if (undoBusy) return;
    setUndoBusy(true);
    try {
      let action: UndoAction | null = null;
      let historyId: string | undefined;

      if (undoStack.length > 0) {
        action = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, -1));
      } else {
        const latest = await fetchLatestHistory({ skipUndoRedo: true });
        if (!latest) {
          setHasHistory(false);
          return;
        }
        const before = (latest.payload_before ?? null) as LocalTask | null;
        const after = (latest.payload_after ?? null) as LocalTask | null;
        if (latest.action === "add") {
          action = after ? { kind: "add", after, label: "Added task" } : null;
        } else if (latest.action === "delete") {
          action = before ? { kind: "delete", before, label: "Deleted task" } : null;
        } else {
          action = before && after ? { kind: "update", before, after, label: "Updated task" } : null;
        }
        if (!action) {
          await deleteHistoryEntry(latest.id);
          return;
        }
        historyId = latest.id;
      }

      if (!action) return;

      if (!historyId) {
        const latest = await fetchLatestHistory({ skipUndoRedo: true });
        if (latest) {
          const targetId = action.kind === "add" ? action.after.id : action.before.id;
          historyId = latest.task_id === targetId ? latest.id : undefined;
        }
      }

      if (action.kind === "add") {
        await queueTaskDeletion(action.after.id);
      } else if (action.kind === "delete") {
        await queueTaskMutation(action.before);
      } else if (action.kind === "update") {
        await queueTaskMutation(action.before);
      }

      setRedoStack((prev) => [...prev, action as UndoAction]);
      if (historyId) {
        await deleteHistoryEntry(historyId);
      }
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.warn("Undo failed", error);
    } finally {
      const latest = await fetchLatestHistory({ skipUndoRedo: true });
      setHasHistory(Boolean(latest));
      setUndoBusy(false);
    }
  }, [undoBusy, undoStack, queryClient]);

  const handleRedo = useCallback(async () => {
    if (undoBusy || redoStack.length === 0) return;
    setUndoBusy(true);
    try {
      const action = redoStack[redoStack.length - 1];
      setRedoStack((prev) => prev.slice(0, -1));
      if (action.kind === "add") {
        await queueTaskMutation(action.after);
        recordHistory({ action: "add", taskId: action.after.id, before: null, after: action.after }, { clearRedo: false });
      } else if (action.kind === "delete") {
        await queueTaskDeletion(action.before.id);
        recordHistory({ action: "delete", taskId: action.before.id, before: action.before, after: null }, { clearRedo: false });
      } else if (action.kind === "update") {
        await queueTaskMutation(action.after);
        recordHistory(
          { action: "update", taskId: action.after.id, before: action.before, after: action.after },
          { clearRedo: false },
        );
      }
      setUndoStack((prev) => [...prev, action]);
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.warn("Redo failed", error);
    } finally {
      const latest = await fetchLatestHistory({ skipUndoRedo: true });
      setHasHistory(Boolean(latest));
      setUndoBusy(false);
    }
  }, [redoStack, undoBusy, queryClient, recordHistory]);

  async function handleResizeTaskTime(task: LocalTask, dayKey: string, startMinutes: number, endMinutes: number) {
    const startDate = new Date(`${dayKey}T00:00:00`);
    startDate.setMinutes(startMinutes);
    const endDate = new Date(`${dayKey}T00:00:00`);
    endDate.setMinutes(endMinutes);
    const before = cloneTask(task);
    const after = {
      ...task,
      due_date: dayKey,
      planned_start: startDate.toISOString(),
      planned_end: endDate.toISOString(),
      moved_to_date: task.is_recurring ? dayKey : task.moved_to_date ?? null,
      updated_at: new Date().toISOString(),
    };
    pushUndo({ kind: "update", before, after, label: "Rescheduled task" });
    patchTasksCache(after);
    patchTaskDetailCache(after);
    await queueTaskMutation(after);
    recordHistory({ action: "resize", taskId: task.id, before, after });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["task", task.id] });
  }

  const handleMoveScheduledTaskToDay = useCallback(
    async (task: LocalTask, dayKey: string, startMinutes?: number, endMinutes?: number) => {
      let plannedStart: string | null = task.planned_start;
      let plannedEnd: string | null = task.planned_end;
      if (typeof startMinutes === "number") {
        const startDate = new Date(`${dayKey}T00:00:00`);
        startDate.setMinutes(startMinutes);
        plannedStart = startDate.toISOString();
      } else {
        plannedStart = null;
      }
      if (typeof endMinutes === "number") {
        const endDate = new Date(`${dayKey}T00:00:00`);
        endDate.setMinutes(endMinutes);
        plannedEnd = endDate.toISOString();
      } else {
        plannedEnd = plannedStart ? plannedStart : null;
      }
      const before = cloneTask(task);
      const after = {
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        planned_start: plannedStart,
        planned_end: plannedEnd,
        moved_to_date: task.is_recurring ? dayKey : task.moved_to_date ?? null,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Moved task" });
      patchTasksCache(after);
      patchTaskDetailCache(after);
      await queueTaskMutation(after);
      recordHistory({ action: "move_scheduled", taskId: task.id, before, after });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [patchTaskDetailCache, patchTasksCache, queryClient, pushUndo, recordHistory],
  );

  const handleReorderScheduledTask = useCallback(
    async (task: LocalTask, dayKey: string, targetTaskId: string, position: "before" | "after") => {
      const dayTasks = (scheduledByDay[dayKey] ?? []).filter((candidate) => candidate.id !== task.id);
      const nextSortIndex = computeBacklogSortIndex(dayTasks, targetTaskId, position);
      const before = cloneTask(task);
      const after = {
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        sort_index: nextSortIndex,
        moved_to_date: task.is_recurring ? dayKey : task.moved_to_date ?? null,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Reordered task" });
      patchTasksCache(after);
      patchTaskDetailCache(after);
      await queueTaskMutation(after);
      recordHistory({ action: "reorder_scheduled", taskId: task.id, before, after });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [patchTaskDetailCache, patchTasksCache, queryClient, scheduledByDay, pushUndo, recordHistory],
  );

  const handleMoveScheduledTaskToBacklog = useCallback(
    async (task: LocalTask, listId: string, targetTaskId?: string | null, position?: "before" | "after") => {
      const listTasks = (backlogByList[listId] ?? []).filter((candidate) => candidate.id !== task.id);
      const effectivePosition = targetTaskId ? position ?? "after" : "after";
      const nextSortIndex = computeBacklogSortIndex(listTasks, targetTaskId ?? null, effectivePosition);
      const before = cloneTask(task);
      const after = {
        ...task,
        list_id: listId,
        due_date: null,
        planned_start: null,
        planned_end: null,
        sort_index: nextSortIndex,
        updated_at: new Date().toISOString(),
      };
      pushUndo({ kind: "update", before, after, label: "Moved to backlog" });
      patchTasksCache(after);
      patchTaskDetailCache(after);
      await queueTaskMutation(after);
      recordHistory({ action: "move_to_backlog", taskId: task.id, before, after });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [backlogByList, patchTaskDetailCache, patchTasksCache, queryClient, pushUndo, recordHistory],
  );

  function handleOpenTaskDetail(task: LocalTask) {
    setTaskDetail(task);
  }

  if (listsLoading && !orderedLists.length) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.accentMuted} />
      </SafeAreaView>
    );
  }

  if (!isFocused) {
    return (
      <PlannerStylesContext.Provider value={styles}>
        <SafeAreaView style={styles.safe} />
      </PlannerStylesContext.Provider>
    );
  }

  return (
    <PlannerStylesContext.Provider value={styles}>
      <SafeAreaView style={styles.safe}>
        <View style={[styles.shell, isDesktop ? styles.shellRow : styles.shellColumn]}>
        {showBacklog ? (
        <PlannerBacklogPanel
          lists={orderedLists}
          activeListId={activeListId}
          onSelectList={(id) => setActiveListId(id)}
          showAllLists={showAllLists}
          onToggleShowAllLists={setShowAllLists}
          tasksByList={backlogByList}
          isLoading={backlogQuery.isLoading}
          onAddTask={handleAddBacklogTask}
          onToggleTask={handleToggleBacklogTask}
          onBeginSchedule={handleBeginSchedule}
          onCreateList={() => setCreateModalOpen(true)}
          onOpenTask={handleOpenTaskDetail}
          onDeleteList={handleRequestDeleteList}
          onOpenListDetails={(list) => setListDetailsTarget(list)}
          undeletableListId={inboxList?.id ?? null}
          onMoveTask={handleMoveBacklogTask}
          onReorderTask={handleReorderBacklogTaskDirect}
          onDragPreviewChange={setDragPreview}
          onAssignTaskToDay={handleAssignBacklogTaskToDay}
          onAssignTaskToSlot={handleAssignBacklogTaskToSlot}
          onCalendarPreviewChange={setCalendarPreview}
          onDayHoverChange={handleBacklogDayHoverChange}
          externalHoverTarget={backlogHoverOverride}
          onOpenListDetails={(list) => setListSettingsTarget(list)}
          currentUserId={currentUserId}
        />
          ) : null}
          <View style={styles.centerPane}>
            <View style={styles.heroShell}>
              <Pressable
                style={[styles.railToggle, !showBacklog && styles.railToggleInactive]}
                onPress={() => setShowBacklog((prev) => !prev)}
                accessibilityLabel="Show or hide backlog rail"
              >
                <Feather name="sidebar" size={18} color={colors.text} />
              </Pressable>
              <View style={styles.heroGrow}>
                <PlannerHero
                  viewMode={viewMode}
                  onChangeViewMode={setViewMode}
                  rangeLabel={heroRangeLabel}
                  onPrev={() => handleShiftWeek(-1)}
                  onNext={() => handleShiftWeek(1)}
                  onToday={handleResetToToday}
                  onOpenSettings={() => setSettingsModalOpen(true)}
                  onOpenNotifications={() => setNotificationsModalOpen(true)}
                  onOpenFilters={() => setFiltersModalOpen(true)}
                  unreadCount={notifications.unreadCount}
                />
              </View>
              <Pressable
                style={[
                  styles.railToggle,
                  (undoBusy || (undoStack.length === 0 && !hasHistory)) && styles.railToggleInactive,
                  styles.undoButton,
                ]}
                disabled={undoBusy || (undoStack.length === 0 && !hasHistory)}
                onPress={handleUndo}
                accessibilityLabel="Undo last action"
              >
                <Feather name="rotate-ccw" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                style={[
                  styles.railToggle,
                  (undoBusy || redoStack.length === 0) && styles.railToggleInactive,
                  styles.undoButton,
                ]}
                disabled={undoBusy || redoStack.length === 0}
                onPress={handleRedo}
                accessibilityLabel="Redo last undone action"
              >
                <Feather name="rotate-cw" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                style={[styles.railToggle, !showTimebox && styles.railToggleInactive]}
                onPress={() => setShowTimebox((prev) => !prev)}
                accessibilityLabel="Show or hide timebox rail"
              >
                <View style={styles.railToggleRightIcon}>
                  <Feather name="sidebar" size={18} color={colors.text} />
                </View>
              </Pressable>
            </View>
            {viewMode === "calendar" ? (
              <PlannerWeekCalendarGrid
                days={plannerDays}
                tasksByDay={scheduledByDay}
                pendingTask={pendingTask}
                onDropPendingIntoDay={handleDropPendingIntoDay}
                onDropPendingIntoSlot={handleDropPendingIntoSlot}
                onOpenTask={handleOpenTaskDetail}
                onToggleTask={handleToggleScheduledTask}
                onSelectDay={(dayKey) => setSelectedDayKey(dayKey)}
                selectedDayKey={resolvedSelectedDayKey}
                gridHeight={calendarGridHeight}
                onResizeTask={handleResizeTaskTime}
                onDragPreviewChange={setDragPreview}
                onDayHoverChange={handleBacklogDayHoverChange}
                onListHoverChange={handleBacklogListHoverChange}
                onDropTaskOnDay={handleMoveScheduledTaskToDay}
                onDropTaskOnList={handleMoveScheduledTaskToBacklog}
                externalPreview={calendarPreview}
                showAssigneeChips={filters.assignee !== "me"}
                currentUserId={currentUserId}
              />
            ) : (
              <PlannerTaskBoard
                days={taskDays}
                tasksByDay={scheduledByDay}
                pendingTask={pendingTask}
                onDropPending={handleDropPendingIntoDay}
                onAddTask={handleAddScheduledTask}
                onToggleTask={handleToggleScheduledTask}
                onOpenTask={handleOpenTaskDetail}
                onSelectDay={(dayKey) => setSelectedDayKey(dayKey)}
                selectedDayKey={resolvedSelectedDayKey}
                onReachPast={() => extendTaskDays("past")}
                onReachFuture={() => extendTaskDays("future")}
                listRef={taskBoardRef}
                onVisibleRangeChange={handleTaskBoardVisibleRangeChange}
                dropHoverDayKey={backlogDayHoverKey}
                onDragPreviewChange={setDragPreview}
                onDayHoverChange={handleBacklogDayHoverChange}
                onListHoverChange={handleBacklogListHoverChange}
                onCalendarPreviewChange={setCalendarPreview}
                dropHoverListTarget={backlogHoverOverride}
                onDropTaskOnDay={handleMoveScheduledTaskToDay}
                onDropTaskOnList={handleMoveScheduledTaskToBacklog}
                onReorderTaskOnDay={handleReorderScheduledTask}
                showAssigneeChips={filters.assignee !== "me"}
                currentUserId={currentUserId}
              />
            )}
          </View>
          {showTimebox && (viewMode === "calendar" ? selectedDay : railDay) ? (
            viewMode === "calendar" ? (
              <PlannerDailyTaskPanel
                day={selectedDay}
                tasks={selectedDayTasks}
                onAddTask={(title) => handleAddScheduledTask(selectedDay.key, title)}
                onToggleTask={handleToggleScheduledTask}
                onOpenTask={handleOpenTaskDetail}
                onStepDay={stepSelectedDay}
                onToday={handleResetToToday}
                disablePrev={!selectedCanPrev}
                disableNext={!selectedCanNext}
                dropHover={Boolean(selectedDay && backlogDayHoverKey === selectedDay.key)}
                onDragPreviewChange={setDragPreview}
                onCalendarPreviewChange={setCalendarPreview}
                onListHoverChange={handleBacklogListHoverChange}
                onDayHoverChange={handleBacklogDayHoverChange}
                onDropTaskOnList={handleMoveScheduledTaskToBacklog}
                onDropTaskOnDay={handleMoveScheduledTaskToDay}
                showAssigneeChips={filters.assignee !== "me"}
                currentUserId={currentUserId}
              />
            ) : (
              <PlannerDailySchedulePanel
                day={railDay}
                tasks={railDayTasks}
              pendingTask={pendingTask}
              onDropPendingIntoSlot={handleDropPendingIntoSlot}
              onOpenTask={handleOpenTaskDetail}
              onToggleTask={handleToggleScheduledTask}
              onResizeTask={handleResizeTaskTime}
              onStepDay={stepRailDay}
              disablePrev={!railCanPrev}
                disableNext={!railCanNext}
                onToday={handleResetToToday}
                externalPreview={calendarPreview}
                onDragPreviewChange={setDragPreview}
                onDayHoverChange={handleBacklogDayHoverChange}
                onListHoverChange={handleBacklogListHoverChange}
                onDropTaskOnDay={handleMoveScheduledTaskToDay}
                onDropTaskOnList={handleMoveScheduledTaskToBacklog}
                showAssigneeChips={filters.assignee !== "me"}
                currentUserId={currentUserId}
              />
            )
          ) : null}
        </View>

        <PlannerCreateListModal
          visible={createModalOpen}
          value={newListName}
          onChangeValue={setNewListName}
          onClose={() => {
            setCreateModalOpen(false);
            setNewListName("");
          }}
          onSubmit={() => handleCreateList(newListName)}
          loading={creatingList}
        />
        <PlannerSettingsModal
          visible={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          userEmail={userEmail}
          calendarStart={calendarStart}
          onChangeCalendarStart={setCalendarStart}
        />
        <PlannerDeleteListModal
          visible={Boolean(deleteTarget)}
          list={deleteTarget}
          taskCount={deleteTaskCount}
          checkingTasks={checkingDeleteTasks}
          submitting={deletingList}
          inboxList={inboxList ?? null}
          lists={orderedLists}
          onClose={handleCloseDeleteModal}
          onConfirm={handleConfirmDeleteList}
      />
      <PlannerNotificationsModal
        visible={notificationsModalOpen}
        notifications={notifications.data ?? []}
        loading={notifications.isLoading}
        invites={pendingInvites.data ?? []}
        invitesLoading={pendingInvites.isLoading}
        onClose={() => setNotificationsModalOpen(false)}
        onMarkRead={(id) => notifications.markRead(id)}
        onMarkAll={() => notifications.markAllRead()}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
      />
      <PlannerFiltersModal
        visible={filtersModalOpen}
        value={filters}
        onChange={(next) => setFilters(next)}
        onClose={() => setFiltersModalOpen(false)}
        assigneeOptions={assigneeOptions}
      />
      <Modal
        visible={duplicateDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicateDialogOpen(false)}
      >
        <Pressable style={styles.dialogBackdrop} onPress={() => setDuplicateDialogOpen(false)}>
          <Pressable style={styles.dialogCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.dialogTitle}>List already exists</Text>
            <Text style={styles.dialogMessage}>{duplicateDialogMessage}</Text>
            <View style={styles.dialogActions}>
              <Pressable style={styles.dialogButton} onPress={() => setDuplicateDialogOpen(false)}>
                <Text style={styles.dialogButtonText}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <PlannerListSettingsModal
        visible={Boolean(listSettingsTarget)}
        list={listSettingsTarget}
        onClose={() => setListSettingsTarget(null)}
        onSaveName={async (id, name) => {
          await upsertList({ id, name });
          queryClient.invalidateQueries({ queryKey: ["lists"] });
        }}
        onDelete={(list) => handleRequestDeleteList(list)}
        onSendInvite={async (email) => {
          if (!listSettingsTarget) return;
          await inviteToListShare({ listId: listSettingsTarget.id, email, role: "collaborator" });
          queryClient.invalidateQueries({ queryKey: ["list-shares", listSettingsTarget.id] });
        }}
        onRemoveMember={async (shareId, memberUserId) => {
          if (!listSettingsTarget) return;
          await revokeShare(shareId, { listId: listSettingsTarget.id, memberUserId });
          queryClient.invalidateQueries({ queryKey: ["list-shares", listSettingsTarget.id] });
        }}
      />
      <PlannerTaskDetailModal
        task={taskDetail}
        onClose={() => setTaskDetail(null)}
        onDeleteTask={async (id) => {
          const snapshot = findTaskById(backlogByList, scheduledByDay, id);
          if (snapshot) {
            pushUndo({ kind: "delete", before: snapshot, label: "Deleted task" });
            recordHistory({ action: "delete", taskId: snapshot.id, before: snapshot, after: null });
          }
          await queueTaskDeletion(id);
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          queryClient.invalidateQueries({ queryKey: ["backlog"] });
          queryClient.invalidateQueries({ queryKey: ["task", id] });
        }}
        onShowToast={showToast}
      />
      {toastMessage ? (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <View
            style={[
              styles.toastCard,
              toastVariant === "success"
                ? { backgroundColor: colors.successAlt, borderColor: colors.success }
                : { backgroundColor: colors.danger, borderColor: colors.danger },
            ]}
          >
            <Text
              style={[
                styles.toastText,
                toastVariant === "error" ? { color: colors.dangerText } : { color: colors.text },
              ]}
            >
              {toastMessage}
            </Text>
          </View>
        </View>
      ) : null}
      {Platform.OS === "web" && dragPreview ? (
        dragPreview.variant === "calendar" ? null : dragPreview.variant === "taskBoard" ? (
          <View
            style={[
              styles.dragPreviewBoardWrapper,
              { top: dragPreview.y - 48, left: dragPreview.x - DAY_COLUMN_WIDTH / 2 },
              { pointerEvents: "none" },
            ]}
          >
            <View style={styles.dragPreviewBoardCard}>
              <Text style={styles.dragPreviewBoardTitle} numberOfLines={3}>
                {dragPreview.task.title}
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.dragPreview,
              { top: dragPreview.y - 36, left: dragPreview.x - 110 },
              { pointerEvents: "none" },
            ]}
          >
            <View style={styles.dragPreviewCard}>
              <View style={styles.dragPreviewRow}>
                <View style={styles.dragPreviewCheckbox} />
                <View style={styles.dragPreviewContent}>
                  <Text style={styles.dragPreviewTitle} numberOfLines={2}>
                    {dragPreview.task.title}
                  </Text>
                  <Text style={styles.dragPreviewSubtitle} numberOfLines={1}>
                    {orderedLists.find((list) => list.id === dragPreview.task.list_id)?.name ?? "Inbox"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )
      ) : null}
      </SafeAreaView>
    </PlannerStylesContext.Provider>
  );
}

function createStyles(colors: ThemeColors) {
  const resizeCursorStyle = Platform.OS === "web" ? ({ cursor: "ns-resize" } as const) : {};
  const webShadow = (value: string) => (Platform.OS === "web" ? { boxShadow: value } : {});
  const nativeShadow = (color: string, opacity: number, radius: number, height = 2) =>
    Platform.OS === "web"
      ? {}
      : {
          shadowColor: color,
          shadowOpacity: opacity,
          shadowRadius: radius,
          shadowOffset: { width: 0, height },
          elevation: Math.max(1, Math.round(radius)),
        };
  const calendarBorder = colors.border === "#e2e8f0" ? "#cbd5e1" : colors.border;
  const isDark = isDarkColor(colors.background);
  const calendarTaskBg = withAlpha(colors.primary, isDark ? 0.24 : 0.12);
  const calendarTaskBorder = withAlpha(colors.primary, isDark ? 0.85 : 0.7);
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  shell: {
    flex: 1,
  },
  shellRow: {
    flexDirection: "row",
  },
  shellColumn: {
    flexDirection: "column",
  },
  backlogPanel: {
    width: 300,
    padding: 20,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelEyebrow: {
    textTransform: "uppercase",
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  drawerListScroll: {
    maxHeight: 150,
  },
  drawerListItem: {
    paddingVertical: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  drawerListItemActive: {
    backgroundColor: colors.border,
  },
  drawerListItemDropTarget: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  drawerListLabel: {
    color: colors.textMuted,
    fontWeight: "500",
  },
  drawerListLabelActive: {
    color: colors.accentMuted,
    fontWeight: "600",
  },
  listDeleteButton: {
    padding: 6,
    borderRadius: 999,
  },
  newListButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  newListButtonText: {
    color: colors.accentMuted,
    fontWeight: "600",
  },
  drawerTasks: {
    marginTop: 20,
    flex: 1,
  },
  drawerTasksTitle: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 12,
  },
  emptyListText: {
    color: colors.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  listBlock: {
    marginBottom: 24,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  listBlockHover: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
    ...nativeShadow(colors.accent, 0.1, 8, 2),
    ...webShadow("0 4px 12px rgba(0,0,0,0.12)"),
  },
  listBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  listBlockTitle: {
    color: colors.text,
    fontWeight: "700",
    flex: 1,
  },
  listBlockHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listTaskCount: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  listTasksContainer: {
    gap: 4,
  },
  listTaskWrapper: {
    gap: 4,
    position: "relative",
    paddingVertical: 2,
  },
  listTaskGhostWrapper: {
    opacity: 0.7,
  },
  listTaskPlaceholderWrapper: {
    opacity: 0,
  },
  listTaskWrapperInner: {
    borderRadius: 12,
  },
  listTaskDragging: {
    opacity: 0.6,
    transform: Platform.OS === "web" ? [{ scale: 0.98 }] : undefined,
  },
  listTaskHover: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  dropIndicator: {
    position: "absolute",
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.9,
  },
  dropIndicatorBefore: {
    top: 0,
  },
  dropIndicatorAfter: {
    bottom: 0,
  },
  dropIndicatorInline: {
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.9,
    marginVertical: 4,
    marginHorizontal: 8,
    pointerEvents: "box-only",
  },
  centerPane: {
    flex: 1,
    backgroundColor: colors.panelBackground,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  dragPreview: {
    position: "absolute",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  dragPreviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 0,
    opacity: 0.92,
    ...nativeShadow("rgba(0,0,0,0.25)", 0.12, 6, 3),
    ...webShadow("0 6px 18px rgba(0,0,0,0.15)"),
  },
  dragPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    minWidth: 220,
    maxWidth: 320,
  },
  dragPreviewCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderMuted,
  },
  dragPreviewContent: {
    flex: 1,
    gap: 2,
  },
  dragPreviewTitle: {
    color: colors.text,
    fontWeight: "600",
  },
  dragPreviewSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  dragPreviewCalendarWrapper: {
    position: "absolute",
    width: DAY_COLUMN_WIDTH,
    paddingHorizontal: 12,
  },
  dragPreviewCalendarBlock: {
    minHeight: 56,
  },
  dragPreviewBoardWrapper: {
    position: "absolute",
    width: DAY_COLUMN_WIDTH,
    paddingHorizontal: 12,
  },
  dragPreviewBoardCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 0,
    ...nativeShadow("rgba(0,0,0,0.25)", 0.12, 6, 3),
    ...webShadow("0 6px 18px rgba(0,0,0,0.15)"),
  },
  dragPreviewBoardTitle: {
    color: colors.text,
    fontWeight: "600",
  },
  heroBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    gap: 16,
  },
  heroLeft: {
    flex: 1,
    gap: 4,
  },
  heroShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  heroGrow: {
    flex: 1,
  },
  heroEyebrow: {
    color: colors.textMuted,
    textTransform: "uppercase",
    fontSize: 11,
    marginBottom: 4,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text,
  },
  heroRange: {
    color: colors.textSecondary,
  },
  heroControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationButton: {
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  notificationBadgeText: {
    color: colors.dangerText,
    fontSize: 10,
    fontWeight: "700",
  },
  railToggle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  railToggleRightIcon: {
    transform: [{ rotate: "180deg" }],
  },
  railToggleInactive: {
    opacity: 0.4,
  },
  undoButton: {
    backgroundColor: "transparent",
  },
  navGroup: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  todayButton: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  todayButtonText: {
    color: colors.text,
    fontWeight: "600",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  taskBoardRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
    paddingBottom: 24,
    flexWrap: "nowrap",
  },
  taskColumn: {
    width: DAY_COLUMN_WIDTH,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 18,
    padding: 16,
    flexShrink: 0,
  },
  taskColumnSelected: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  taskColumnDropTarget: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  taskColumnHeader: {
    marginBottom: 12,
  },
  taskColumnDay: {
    color: colors.text,
    fontWeight: "600",
  },
  taskColumnDate: {
    color: colors.textMuted,
    fontSize: 12,
  },
  dropZone: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderMuted,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  dropZoneLabel: {
    color: colors.accentMuted,
    fontWeight: "600",
  },
  calendarGridWrapper: {
    paddingBottom: 24,
    flexGrow: 1,
    minWidth: "100%",
  },
  calendarGrid: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    flex: 1,
  },
  calendarGridHeader: {
    flexDirection: "row",
    backgroundColor: colors.panelBackground,
    borderBottomWidth: 1,
    borderColor: calendarBorder,
  },
  calendarGridCorner: {
    width: 90,
    padding: 12,
    borderRightWidth: 1,
    borderColor: calendarBorder,
  },
  calendarHeaderCell: {
    flex: 1,
    minWidth: CALENDAR_DAY_WIDTH,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderColor: calendarBorder,
  },
  calendarHeaderCellSelected: {
    backgroundColor: colors.surfaceAlt,
  },
  calendarHeaderDay: {
    color: colors.text,
    fontWeight: "600",
  },
  calendarHeaderDate: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  calendarGridScroll: {
    flexGrow: 1,
  },
  calendarGridBody: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  calendarHoursColumn: {
    width: 90,
    borderRightWidth: 1,
    borderColor: calendarBorder,
  },
  calendarHourRow: {
    height: HOUR_BLOCK_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: calendarBorder,
  },
  calendarHourRowLast: {
    borderBottomWidth: 0,
  },
  calendarHourText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  calendarDayColumn: {
    flex: 1,
    minWidth: CALENDAR_DAY_WIDTH,
    borderRightWidth: 1,
    borderColor: calendarBorder,
    position: "relative",
  },
  calendarDaySlots: {
    flexDirection: "column",
  },
  calendarDaySlot: {
    height: HOUR_BLOCK_HEIGHT,
    borderBottomWidth: 1,
    borderColor: calendarBorder,
  },
  calendarDaySlotSelected: {
    backgroundColor: colors.surfaceElevated,
  },
  calendarDaySlotLast: {
    borderBottomWidth: 0,
  },
  calendarDayTasks: {
    position: "absolute",
    top: 0,
    left: 6,
    right: 6,
  },
  calendarBlock: {
    borderRadius: 12,
    padding: 8,
    backgroundColor: calendarTaskBg,
    borderWidth: 1,
    borderColor: calendarTaskBorder,
    position: "relative",
  },
  calendarBlockMuted: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  calendarBlockContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  calendarAssigneeChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  calendarAssigneeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  calendarBlockFloating: {
    position: "absolute",
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...nativeShadow("rgba(0,0,0,0.15)", 0.2, 4, 2),
    ...webShadow("0 4px 10px rgba(0,0,0,0.15)"),
  },
  calendarBlockText: {
    color: colors.text,
    flex: 1,
    marginRight: 8,
    fontSize: 12,
    lineHeight: 16,
    overflow: "hidden",
  },
  calendarBlockDragging: {
    opacity: 1,
    borderWidth: 2,
    borderColor: colors.primary,
    ...nativeShadow(colors.primary, 0.25, 10, 4),
    ...webShadow("0 6px 14px rgba(0,0,0,0.25)"),
  },
  calendarResizeHandle: {
    position: "absolute",
    left: -6,
    right: -6,
    height: 12,
    zIndex: 2,
    ...resizeCursorStyle,
  },
  calendarResizeHandleTop: {
    top: -6,
  },
  calendarResizeHandleBottom: {
    bottom: -6,
  },
  timeboxPanel: {
    width: 320,
    padding: 20,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderColor: colors.border,
  },
  timeboxPanelDropTarget: {
    borderColor: colors.accent,
    ...nativeShadow(colors.accent, 0.25, 16, 6),
    ...webShadow("0 8px 24px rgba(0,0,0,0.16)"),
    backgroundColor: colors.surfaceAlt,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  panelTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  panelNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeboxDate: {
    color: colors.text,
    fontWeight: "600",
    marginBottom: 12,
  },
  railDateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  railDateLabel: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  railDateLabelText: {
    color: colors.text,
    fontWeight: "600",
  },
  timeboxList: {
    marginTop: 12,
  },
  dayScheduleScroll: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    overflow: "hidden",
  },
  dayScheduleGrid: {
    flexDirection: "row",
  },
  dayScheduleColumn: {
    flex: 1,
    position: "relative",
  },
  dayScheduleSlots: {
    flexDirection: "column",
  },
  dayScheduleSlot: {
    height: HOUR_BLOCK_HEIGHT,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  dayScheduleSlotLast: {
    borderBottomWidth: 0,
  },
  dayScheduleTasks: {
    position: "absolute",
    top: 0,
    left: 8,
    right: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  settingsModalCard: {
    width: "100%",
    maxWidth: 980,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 0,
    overflow: "hidden",
  },
  modalSheet: {
    width: "100%",
    maxWidth: 880,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalSubtitle: {
    color: colors.textSecondary,
  },
  modalSection: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modalSectionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  filterPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 2,
  },
  filterPillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  filterPillText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  filterPillTextActive: {
    color: colors.text,
  },
  filterPillMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  modalSectionMeta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  settingsModalShell: {
    flexDirection: "row",
    minHeight: 520,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 20,
  },
  settingsSidebar: {
    width: 280,
    padding: 24,
    backgroundColor: colors.sidebarBackground,
    borderRightWidth: 1,
    borderColor: colors.divider,
    gap: 12,
  },
  settingsHeaderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  settingsAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsAvatarText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
  },
  settingsUserName: {
    color: colors.text,
    fontWeight: "600",
  },
  settingsUserEmail: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  settingsSignOutButton: {
    marginTop: "auto",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsSignOutButtonDisabled: {
    opacity: 0.7,
  },
  settingsSignOutText: {
    color: colors.danger,
    fontWeight: "600",
  },
  settingsMenu: {
    gap: 6,
  },
  settingsMenuItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  settingsMenuItemActive: {
    backgroundColor: colors.primary,
  },
  settingsMenuItemText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  settingsMenuItemTextActive: {
    color: colors.primaryText,
  },
  settingsContent: {
    flex: 1,
    padding: 28,
    gap: 16,
    backgroundColor: colors.panelBackground,
  },
  settingsPanelTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  settingsModalScroll: {
    flex: 1,
  },
  settingsModalScrollContent: {
    gap: 12,
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  settingsCardTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  shareMemberName: {
    color: colors.text,
    fontWeight: "600",
  },
  shareMemberMeta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  notificationRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    backgroundColor: colors.surfaceAlt,
    gap: 6,
  },
  notificationMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notificationTitle: {
    color: colors.text,
    fontWeight: "700",
  },
  notificationTime: {
    color: colors.textMuted,
    fontSize: 12,
  },
  notificationBody: {
    color: colors.textSecondary,
  },
  notificationBodySecondary: {
    color: colors.textMuted,
    fontSize: 12,
  },
  notificationUnread: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 12,
  },
  notificationRowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  notificationIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  notificationKindPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 8,
  },
  notificationKindText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  notificationUnreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginLeft: 8,
    marginTop: 4,
  },
  modalTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  modalTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  modalTabActive: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
  },
  modalTabText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  modalTabTextActive: {
    color: colors.text,
  },
  modalTabBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  modalTabBadgeText: {
    color: colors.inverseText,
    fontWeight: "700",
    textAlign: "center",
    fontSize: 12,
  },
  inviteCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  inviteActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  inviteButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  inviteButtonDisabled: {
    opacity: 0.7,
  },
  inviteButtonText: {
    color: colors.primaryText,
    fontWeight: "700",
  },
  inviteButtonSecondary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteButtonSecondaryDisabled: {
    opacity: 0.6,
  },
  inviteButtonSecondaryText: {
    color: colors.text,
    fontWeight: "600",
  },
  settingsFormGroup: {
    gap: 6,
  },
  settingsLabel: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingsRowDisabled: {
    opacity: 0.6,
  },
  settingsSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingsSwitchLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  settingsInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  deleteListStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteListDescription: {
    color: colors.textSecondary,
    marginTop: 6,
  },
  deleteOptionGroup: {
    marginTop: 16,
    gap: 12,
  },
  deleteOptionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  deleteOptionLabels: {
    flex: 1,
    gap: 2,
  },
  deleteOptionTitle: {
    color: colors.text,
    fontWeight: "600",
  },
  deleteOptionSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  deleteOptionDisabled: {
    opacity: 0.4,
  },
  moveListPicker: {
    marginTop: 8,
    gap: 8,
  },
  moveListOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moveListOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  moveListOptionText: {
    color: colors.textSecondary,
    fontWeight: "500",
  },
  moveListOptionTextActive: {
    color: colors.accent,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalGhostButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalGhostText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  modalPrimaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  modalPrimaryDisabled: {
    backgroundColor: colors.accentMuted,
  },
  addTaskInput: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    fontSize: 16,
  },
  modalPrimaryText: {
    color: colors.primaryText,
    fontWeight: "600",
  },
  modalDangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: "transparent",
  },
  modalDangerIcon: {
    marginTop: -1,
  },
  modalDangerText: {
    color: colors.danger,
    fontWeight: "700",
  },
  modalDangerDisabled: {
    opacity: 0.6,
  },
  taskDetailModalCard: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "85%",
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  taskDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
  },
  taskDetailTitleWrap: {
    flex: 1,
    gap: 6,
  },
  taskDetailTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  taskDetailTitleDone: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  taskDetailTitleInput: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  taskDetailStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  taskDetailStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  taskDetailStatusUnsaved: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  taskDetailStatusSaved: {
    borderColor: colors.success,
    backgroundColor: colors.successAlt,
  },
  taskDetailStatusText: {
    color: colors.text,
    fontWeight: "600",
  },
  taskDetailActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  taskDetailFooter: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  taskDetailFooterSpacer: {
    flex: 1,
  },
  taskDetailStatusToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  taskDetailStatusToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  taskDetailStatusToggleDone: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  taskDetailStatusToggleDisabled: {
    opacity: 0.6,
  },
  taskDetailActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  taskDetailCancel: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  taskDetailCancelText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  taskDetailSave: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  taskDetailSaveDisabled: {
    opacity: 0.6,
  },
  taskDetailSaveText: {
    color: colors.primaryText,
    fontWeight: "700",
  },
  taskDetailSaveLabel: {
    alignItems: "flex-start",
  },
  taskDetailSaveSubtext: {
    color: colors.primaryText,
    fontSize: 12,
    marginTop: 2,
    opacity: 0.9,
  },
  taskDetailErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surfaceAlt,
  },
  taskDetailErrorText: {
    color: colors.text,
    flexShrink: 1,
  },
  taskDetailScroll: {
    maxHeight: "100%",
  },
  taskDetailContent: {
    backgroundColor: colors.surface,
    paddingBottom: 16,
  },
  taskDetailInlineActions: {
    paddingVertical: 4,
  },
  taskDetailDetachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskDetailDetachDisabled: {
    opacity: 0.6,
  },
  taskDetailDetachText: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  taskDetailDetachIcon: {
    marginTop: -1,
  },
  toastContainer: {
    position: "absolute",
    top: Platform.OS === "web" ? 24 : 48,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
    pointerEvents: "box-none",
  },
  toastCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    ...nativeShadow(colors.text, 0.16, 8, 4),
    elevation: 6,
  },
  toastText: {
    color: colors.text,
    fontWeight: "700",
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.text, 0.35),
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialogCard: {
    width: 420,
    maxWidth: "100%",
    borderRadius: 16,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...nativeShadow(colors.text, 0.08, 10, 6),
    ...webShadow("0 12px 35px rgba(0,0,0,0.22)"),
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  dialogMessage: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  dialogButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  dialogButtonText: {
    color: colors.primaryText,
    fontWeight: "600",
    fontSize: 15,
  },
  });
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDarkColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return false;
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 0.5;
}

function computeBacklogSortIndex(
  listTasks: LocalTask[],
  targetTaskId: string | null,
  position: "before" | "after",
) {
  if (!listTasks.length) {
    return 0;
  }
  const normalized = listTasks.map((task, index) => ({
    ...task,
    sort_index: task.sort_index ?? index + 1,
  }));
  if (!targetTaskId) {
    return (normalized[normalized.length - 1]?.sort_index ?? normalized.length) + 1;
  }
  const targetIndex = normalized.findIndex((task) => task.id === targetTaskId);
  if (targetIndex < 0) {
    return (normalized[normalized.length - 1]?.sort_index ?? normalized.length) + 1;
  }
  if (position === "before") {
    const beforeTask = normalized[targetIndex - 1];
    const beforeIndex = beforeTask?.sort_index ?? normalized[targetIndex].sort_index - 1;
    const currentIndex = normalized[targetIndex].sort_index;
    return beforeTask ? (beforeIndex + currentIndex) / 2 : currentIndex - 1;
  }
  const afterTask = normalized[targetIndex + 1];
  const currentIndex = normalized[targetIndex].sort_index;
  const afterIndex = afterTask?.sort_index ?? currentIndex + 1;
  return (currentIndex + afterIndex) / 2;
}
