import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import type { FlashList as FlashListType } from "@shopify/flash-list";
import { useLists } from "../../src/hooks/useLists";
import type { RemoteList } from "../../src/hooks/useLists";
import {
  fetchListBacklog,
  countTasksInList,
  deleteTasksInList,
  moveTasksToList,
  type TaskWindowRow,
} from "../../src/services/api/tasks";
import { useTasks } from "../../src/hooks/useTasks";
import { useListsDrawer } from "../../src/contexts/ListsDrawerContext";
import { useAuth } from "../../src/contexts/AuthContext";
import type { LocalTask } from "../../src/lib/db";
import { queueTaskMutation, queueTaskDeletion } from "../../src/lib/sync";
import { generateUUID } from "../../src/lib/uuid";
import { useTheme } from "../../src/contexts/ThemeContext";
import type { ThemeColors } from "../../src/theme";
import { deleteList as deleteListRow } from "../../src/services/api/lists";
import type { DeleteAction, PlannerDay, PlannerViewMode } from "../../src/components/planner/types";
import { PlannerStylesContext } from "../../src/components/planner/PlannerStylesContext";
import { PlannerBacklogPanel } from "../../src/components/planner/PlannerBacklogPanel";
import { PlannerHero } from "../../src/components/planner/PlannerHero";
import { PlannerTaskBoard } from "../../src/components/planner/PlannerTaskBoard";
import { PlannerWeekCalendarGrid } from "../../src/components/planner/PlannerWeekCalendarGrid";
import { PlannerDailySchedulePanel, PlannerDailyTaskPanel } from "../../src/components/planner/PlannerDailyPanels";
import {
  PlannerSettingsModal,
  PlannerCreateListModal,
  PlannerDeleteListModal,
  PlannerTaskDetailModal,
} from "../../src/components/planner/PlannerModals";
import { useIsFocused } from "@react-navigation/native";
import { DAY_COLUMN_WIDTH, HOUR_BLOCK_HEIGHT } from "../../src/components/planner/time";
import type { PlannerListHoverTarget } from "../../src/components/planner/drag/dropTargets";
import type { PlannerDragPreview } from "../../src/components/planner/types";

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
  };
}

export default function ListsScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1280;
  const daysPerView = isDesktop ? 7 : 3;
  const [calendarStart, setCalendarStart] = useState<"sunday" | "monday">("monday");

  const { data: lists, isLoading: listsLoading, upsertList } = useLists();
  const { activeListId, setActiveListId } = useListsDrawer();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [viewMode, setViewMode] = useState<PlannerViewMode>("tasks");
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

  const orderedLists = useMemo(() => {
    if (!lists) return [];
    const inbox = lists.find((list) => (list.name ?? "").toLowerCase() === "inbox");
    const rest = lists.filter((list) => list.id !== inbox?.id);
    return inbox ? [inbox, ...rest] : rest;
  }, [lists]);
  const inboxList = orderedLists[0];
  const backlogListIds = useMemo(() => orderedLists.map((list) => list.id), [orderedLists]);
  const backlogQuery = useQuery({
    queryKey: ["backlog", backlogListIds.join("|")],
    queryFn: () => fetchListBacklog(backlogListIds.length ? backlogListIds : undefined),
    enabled: backlogListIds.length > 0,
  });
  const backlogByList = useMemo(() => {
    const bucket: Record<string, LocalTask[]> = {};
    orderedLists.forEach((list) => {
      bucket[list.id] = [];
    });
    const fallbackListId = orderedLists[0]?.id ?? null;
    (backlogQuery.data ?? []).forEach((task) => {
      const targetListId = task.list_id ?? fallbackListId;
      if (!targetListId) return;
      bucket[targetListId] = bucket[targetListId] ?? [];
      bucket[targetListId].push(task);
    });
    return bucket;
  }, [orderedLists, backlogQuery.data]);

  const handleDropPendingIntoDay = useCallback(
    async (dayKey: string) => {
    if (!pendingTask) return;
      await queueTaskMutation({
        ...pendingTask,
        list_id: pendingTask.list_id ?? null,
        due_date: dayKey,
        planned_start: null,
        planned_end: null,
        updated_at: new Date().toISOString(),
      });
      setPendingTask(null);
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    [pendingTask, queryClient],
  );

  const handleDropPendingIntoSlot = useCallback(
    async (dayKey: string, hour: number) => {
      if (!pendingTask) return;
      const start = new Date(`${dayKey}T${hour.toString().padStart(2, "0")}:00:00`);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      await queueTaskMutation({
        ...pendingTask,
        list_id: pendingTask.list_id ?? null,
        due_date: dayKey,
        planned_start: start.toISOString(),
        planned_end: end.toISOString(),
        updated_at: new Date().toISOString(),
      });
      setPendingTask(null);
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    [pendingTask, queryClient],
  );

  const [showBacklog, setShowBacklog] = useState(true);
  const [showTimebox, setShowTimebox] = useState(isDesktop);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const taskBoardRef = useRef<FlashListType<PlannerDay> | null>(null);
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

  const scheduledByDay = useMemo(() => {
    const bucket: Record<string, LocalTask[]> = {};
    taskDays.forEach((day) => {
      bucket[day.key] = bucket[day.key] ?? [];
    });
    (scheduledRows ?? []).forEach((row) => {
      if (row.due_date) {
        bucket[row.due_date] = bucket[row.due_date] ?? [];
        bucket[row.due_date].push(rowToLocalTask(row));
      }
    });
    return bucket;
  }, [taskDays, scheduledRows]);

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
    } catch {
      Alert.alert("Unable to create list", "Please try again shortly.");
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
    await queueTaskMutation(newTask);
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
  }

  async function handleToggleBacklogTask(task: LocalTask) {
    await queueTaskMutation({
      ...task,
      status: task.status === "done" ? "todo" : "done",
      updated_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
  }

  const handleMoveBacklogTask = useCallback(
    async (task: LocalTask, listId: string) => {
      if (task.list_id === listId) return;
      await queueTaskMutation({
        ...task,
        list_id: listId,
        due_date: null,
        planned_start: null,
        planned_end: null,
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
    },
    [queryClient],
  );

  const handleReorderBacklogTaskDirect = useCallback(
    async (task: LocalTask, listId: string, targetTaskId: string | null, position: "before" | "after") => {
      const listTasks = (backlogByList[listId] ?? []).filter((candidate) => candidate.id !== task.id);
      const nextSortIndex = computeBacklogSortIndex(listTasks, targetTaskId, position);
      await queueTaskMutation({
        ...task,
        list_id: listId,
        due_date: null,
        planned_start: null,
        planned_end: null,
        sort_index: nextSortIndex,
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
    },
    [backlogByList, queryClient],
  );

  const handleAssignBacklogTaskToDay = useCallback(
    async (task: LocalTask, dayKey: string) => {
      await queueTaskMutation({
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        planned_start: null,
        planned_end: null,
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    [queryClient],
  );

  const handleAssignBacklogTaskToSlot = useCallback(
    async (task: LocalTask, dayKey: string, hour: number) => {
      const start = new Date(`${dayKey}T${hour.toString().padStart(2, "0")}:00:00`);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      await queueTaskMutation({
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        planned_start: start.toISOString(),
        planned_end: end.toISOString(),
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [queryClient],
  );

  async function handleAddScheduledTask(dayKey: string, title: string) {
    if (!title.trim()) return;
    const newTask: LocalTask = {
      id: generateUUID(),
      list_id: activeListId ?? null,
      title: title.trim(),
      status: "todo",
      due_date: dayKey,
    };
    await queueTaskMutation(newTask);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function handleToggleScheduledTask(task: LocalTask) {
    await upsertScheduledTask({
      ...task,
      status: task.status === "done" ? "todo" : "done",
      updated_at: new Date().toISOString(),
    });
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

  async function handleResizeTaskTime(task: LocalTask, dayKey: string, startMinutes: number, endMinutes: number) {
    const startDate = new Date(`${dayKey}T00:00:00`);
    startDate.setMinutes(startMinutes);
    const endDate = new Date(`${dayKey}T00:00:00`);
    endDate.setMinutes(endMinutes);
    await queueTaskMutation({
      ...task,
      due_date: dayKey,
      planned_start: startDate.toISOString(),
      planned_end: endDate.toISOString(),
      updated_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
      await queueTaskMutation({
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        planned_start: plannedStart,
        planned_end: plannedEnd,
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [queryClient],
  );

  const handleReorderScheduledTask = useCallback(
    async (task: LocalTask, dayKey: string, targetTaskId: string, position: "before" | "after") => {
      const dayTasks = (scheduledByDay[dayKey] ?? []).filter((candidate) => candidate.id !== task.id);
      const nextSortIndex = computeBacklogSortIndex(dayTasks, targetTaskId, position);
      await queueTaskMutation({
        ...task,
        list_id: task.list_id ?? null,
        due_date: dayKey,
        sort_index: nextSortIndex,
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [queryClient, scheduledByDay],
  );

  const handleMoveScheduledTaskToBacklog = useCallback(
    async (task: LocalTask, listId: string, targetTaskId?: string | null, position?: "before" | "after") => {
      const listTasks = (backlogByList[listId] ?? []).filter((candidate) => candidate.id !== task.id);
      const effectivePosition = targetTaskId ? position ?? "after" : "after";
      const nextSortIndex = computeBacklogSortIndex(listTasks, targetTaskId ?? null, effectivePosition);
      await queueTaskMutation({
        ...task,
        list_id: listId,
        due_date: null,
        planned_start: null,
        planned_end: null,
        sort_index: nextSortIndex,
        updated_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    [backlogByList, queryClient],
  );

  function handleOpenTaskDetail(task: LocalTask) {
    setTaskDetailId(task.id);
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
          tasksByList={backlogByList}
          isLoading={backlogQuery.isLoading}
          onAddTask={handleAddBacklogTask}
          onToggleTask={handleToggleBacklogTask}
          onBeginSchedule={handleBeginSchedule}
          onCreateList={() => setCreateModalOpen(true)}
          onOpenTask={handleOpenTaskDetail}
          onDeleteList={handleRequestDeleteList}
          undeletableListId={inboxList?.id ?? null}
          onMoveTask={handleMoveBacklogTask}
          onReorderTask={handleReorderBacklogTaskDirect}
          onDragPreviewChange={setDragPreview}
          onAssignTaskToDay={handleAssignBacklogTaskToDay}
          onAssignTaskToSlot={handleAssignBacklogTaskToSlot}
          onCalendarPreviewChange={setCalendarPreview}
          onDayHoverChange={handleBacklogDayHoverChange}
          externalHoverTarget={backlogHoverOverride}
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
                />
              </View>
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
                onDropTaskOnDay={handleMoveScheduledTaskToDay}
                onDropTaskOnList={handleMoveScheduledTaskToBacklog}
                onReorderTaskOnDay={handleReorderScheduledTask}
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
      <PlannerTaskDetailModal
        taskId={taskDetailId}
        onClose={() => setTaskDetailId(null)}
        onDeleteTask={async (id) => {
          await queueTaskDeletion(id);
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          queryClient.invalidateQueries({ queryKey: ["backlog"] });
          queryClient.invalidateQueries({ queryKey: ["task", id] });
        }}
      />
      {Platform.OS === "web" && dragPreview ? (
        dragPreview.variant === "calendar" ? null : dragPreview.variant === "taskBoard" ? (
          <View
            pointerEvents="none"
            style={[
              styles.dragPreviewBoardWrapper,
              { top: dragPreview.y - 48, left: dragPreview.x - DAY_COLUMN_WIDTH / 2 },
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
            pointerEvents="none"
            style={[styles.dragPreview, { top: dragPreview.y - 36, left: dragPreview.x - 110 }]}
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
    maxHeight: 140,
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
    shadowColor: colors.accent,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
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
    gap: 6,
  },
  listTaskWrapper: {
    gap: 4,
    position: "relative",
    paddingVertical: 6,
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
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    opacity: 0.92,
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
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
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
  },
  calendarGrid: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  calendarGridHeader: {
    flexDirection: "row",
    backgroundColor: colors.panelBackground,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  calendarGridCorner: {
    width: 90,
    padding: 12,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  calendarHeaderCell: {
    width: 160,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderColor: colors.border,
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
    borderColor: colors.border,
  },
  calendarHourRow: {
    height: HOUR_BLOCK_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  calendarHourRowLast: {
    borderBottomWidth: 0,
  },
  calendarHourText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  calendarDayColumn: {
    width: 160,
    borderRightWidth: 1,
    borderColor: colors.border,
    position: "relative",
  },
  calendarDaySlots: {
    flexDirection: "column",
  },
  calendarDaySlot: {
    height: HOUR_BLOCK_HEIGHT,
    borderBottomWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.surfaceAlt,
    position: "relative",
  },
  calendarBlockContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  calendarBlockFloating: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "rgba(0,0,0,0.15)",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  calendarBlockText: {
    color: colors.text,
    flex: 1,
    marginRight: 8,
    fontSize: 12,
  },
  calendarBlockDragging: {
    opacity: 1,
    borderWidth: 2,
    borderColor: colors.accent,
    shadowOpacity: 0.5,
    shadowColor: colors.accent,
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
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
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
    justifyContent: "space-between",
  },
  taskDetailTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  taskDetailClose: {
    padding: 6,
  },
  taskDetailScroll: {
    maxHeight: "100%",
  },
  taskDetailContent: {
    backgroundColor: colors.surface,
    paddingBottom: 16,
  },
  });
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
