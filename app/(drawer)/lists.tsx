import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useLists } from "../../src/hooks/useLists";
import type { RemoteList } from "../../src/hooks/useLists";
import { fetchListBacklog, type TaskWindowRow } from "../../src/services/api/tasks";
import { useTasks } from "../../src/hooks/useTasks";
import { useListsDrawer } from "../../src/contexts/ListsDrawerContext";
import { useAuth } from "../../src/contexts/AuthContext";
import type { LocalTask } from "../../src/lib/db";
import { queueTaskMutation } from "../../src/lib/sync";
import { generateUUID } from "../../src/lib/uuid";
import { AddTaskInput } from "../../src/components/AddTaskInput";
import { ListTaskItem } from "../../src/components/ListTaskItem";
import { SegmentedControl } from "../../src/components/SegmentedControl";
import { TaskCard } from "../../src/components/TaskCard";
import { TaskDetailView } from "../../src/components/TaskDetailView";
import { useTheme } from "../../src/contexts/ThemeContext";
import type { ThemeColors } from "../../src/theme";

type ViewMode = "calendar" | "tasks";

type PlannerDay = {
  key: string;
  weekday: string;
  monthText: string;
  dayNumber: string;
  dateObj: Date;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DAY_COLUMN_WIDTH = 260;

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized} ${suffix}`;
}

function formatDateKey(date: Date) {
  return date.toISOString().split("T")[0];
}

function buildPlannerDays(offset: number, count: number): PlannerDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
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

type PlannerStyles = ReturnType<typeof createStyles>;
const PlannerStylesContext = createContext<PlannerStyles | null>(null);

function usePlannerStyles() {
  const value = useContext(PlannerStylesContext);
  if (!value) {
    throw new Error("Planner styles missing");
  }
  return value;
}

function rowToLocalTask(row: TaskWindowRow): LocalTask {
  return {
    id: row.id,
    user_id: row.user_id,
    list_id: row.list_id,
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1280;
  const daysPerView = isDesktop ? 7 : 3;

  const { data: lists, isLoading: listsLoading, upsertList } = useLists();
  const { activeListId, setActiveListId, triggerCreateList, setCreateListHandler } = useListsDrawer();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tasks");
  const [plannerOffset, setPlannerOffset] = useState(0);
  const plannerDays = useMemo(() => buildPlannerDays(plannerOffset, daysPerView), [plannerOffset, daysPerView]);
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
  const [showBacklog, setShowBacklog] = useState(true);
  const [showTimebox, setShowTimebox] = useState(isDesktop);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const todayKey = formatDateKey(new Date());
  const [taskDayWindow, setTaskDayWindow] = useState(() => ({
    start: -daysPerView * 2,
    end: daysPerView * 2,
  }));
  const taskDays = useMemo(() => buildPlannerDayRange(taskDayWindow.start, taskDayWindow.end), [taskDayWindow]);

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

  const userName = useMemo(() => {
    const email = session?.user.email ?? "";
    const name =
      (session?.user.user_metadata?.full_name as string | undefined) ??
      (session?.user.user_metadata?.name as string | undefined) ??
      "";
    if (name) return name;
    if (email) return email.split("@")[0];
    return "You";
  }, [session]);
  const userEmail = session?.user.email ?? "demo@wonton.app";
  useEffect(() => {
    setShowTimebox(isDesktop);
  }, [isDesktop]);

  const orderedLists = useMemo(() => {
    if (!lists) return [];
    const inbox = lists.find((list) => (list.name ?? "").toLowerCase() === "inbox");
    const rest = lists.filter((list) => list.id !== inbox?.id);
    return inbox ? [inbox, ...rest] : rest;
  }, [lists]);

  const inboxList = orderedLists[0];

  useEffect(() => {
    if (!activeListId && inboxList) {
      setActiveListId(inboxList.id);
    }
  }, [activeListId, inboxList, setActiveListId]);

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

  useEffect(() => {
    setCreateListHandler(() => () => setCreateModalOpen(true));
    return () => setCreateListHandler(null);
  }, [setCreateListHandler]);

  const backlogQuery = useQuery({
    queryKey: ["backlog", activeListId],
    queryFn: () => fetchListBacklog(activeListId ? [activeListId] : orderedLists.map((list) => list.id)),
    enabled: Boolean(inboxList),
  });

  const backlogByList = useMemo(() => {
    const bucket: Record<string, LocalTask[]> = {};
    orderedLists.forEach((list) => {
      bucket[list.id] = [];
    });
    (backlogQuery.data ?? []).forEach((task) => {
      bucket[task.list_id] = bucket[task.list_id] ?? [];
      bucket[task.list_id].push(task);
    });
    return bucket;
  }, [orderedLists, backlogQuery.data]);

  const activeBacklogTasks = activeListId ? backlogByList[activeListId] ?? [] : [];

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
    setPlannerOffset((value) => value + delta);
  }

  function handleResetToToday() {
    setPlannerOffset(0);
    setSelectedDayKey(todayKey);
    setRailDayKey(todayKey);
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

  async function handleAddScheduledTask(dayKey: string, title: string) {
    if (!title.trim()) return;
    const listId = inboxList?.id ?? orderedLists[0]?.id;
    if (!listId) return;
    const newTask: LocalTask = {
      id: generateUUID(),
      list_id: listId,
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

  async function handleDropPendingIntoDay(dayKey: string) {
    if (!pendingTask) return;
    await queueTaskMutation({
      ...pendingTask,
      due_date: dayKey,
      planned_start: null,
      planned_end: null,
      updated_at: new Date().toISOString(),
    });
    setPendingTask(null);
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function handleDropPendingIntoSlot(dayKey: string, hour: number) {
    if (!pendingTask) return;
    const start = new Date(`${dayKey}T${hour.toString().padStart(2, "0")}:00:00`);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    await queueTaskMutation({
      ...pendingTask,
      due_date: dayKey,
      planned_start: start.toISOString(),
      planned_end: end.toISOString(),
      updated_at: new Date().toISOString(),
    });
    setPendingTask(null);
    queryClient.invalidateQueries({ queryKey: ["backlog"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  function handleOpenTaskDetail(task: LocalTask) {
    setTaskDetailId(task.id);
  }

  function handleBacklogInput(title: string) {
    const targetListId = activeListId ?? inboxList?.id;
    if (!targetListId) {
      Alert.alert("Create a list first", "Add Inbox or another list to capture tasks.");
      return;
    }
    return handleAddBacklogTask(targetListId, title);
  }

  if (listsLoading && !orderedLists.length) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.accentMuted} />
      </SafeAreaView>
    );
  }

  return (
    <PlannerStylesContext.Provider value={styles}>
      <SafeAreaView style={styles.safe}>
      <View style={[styles.shell, isDesktop ? styles.shellRow : styles.shellColumn]}>
        {showBacklog ? (
        <BacklogPanel
          lists={orderedLists}
          activeListId={activeListId}
          onSelectList={(id) => setActiveListId(id)}
          tasks={activeBacklogTasks}
          isLoading={backlogQuery.isLoading}
          onAddTask={handleBacklogInput}
          onToggleTask={handleToggleBacklogTask}
          onBeginSchedule={handleBeginSchedule}
          onCreateList={() => triggerCreateList()}
          onOpenTask={handleOpenTaskDetail}
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
              rangeLabel={`${plannerDays[0]?.monthText ?? ""} ${plannerDays[0]?.dayNumber ?? ""} – ${
                plannerDays[plannerDays.length - 1]?.monthText ?? ""
              } ${plannerDays[plannerDays.length - 1]?.dayNumber ?? ""}`}
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
          <WeekCalendarGrid
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
          />
        ) : (
          <TaskPlannerBoard
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
          />
        )}
        </View>
        {showTimebox && (viewMode === "calendar" ? selectedDay : railDay) ? (
          viewMode === "calendar" ? (
            <DailyTaskPanel
              day={selectedDay}
              tasks={selectedDayTasks}
              onAddTask={(title) => handleAddScheduledTask(selectedDay.key, title)}
              onToggleTask={handleToggleScheduledTask}
              onOpenTask={handleOpenTaskDetail}
              onStepDay={stepSelectedDay}
              onToday={handleResetToToday}
              disablePrev={!selectedCanPrev}
              disableNext={!selectedCanNext}
            />
          ) : (
            <DailySchedulePanel
              day={railDay}
              tasks={railDayTasks}
              pendingTask={pendingTask}
              onDropPendingIntoSlot={handleDropPendingIntoSlot}
              onOpenTask={handleOpenTaskDetail}
              onToggleTask={handleToggleScheduledTask}
              onStepDay={stepRailDay}
              disablePrev={!railCanPrev}
              disableNext={!railCanNext}
              onToday={handleResetToToday}
            />
          )
        ) : null}
      </View>

      <CreateListModal
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
      <AppSettingsModal
        visible={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        userName={userName}
        userEmail={userEmail}
        onOpenFullSettings={() => {
          setSettingsModalOpen(false);
          router.push("/settings/personalization");
        }}
      />
      <TaskDetailModal taskId={taskDetailId} onClose={() => setTaskDetailId(null)} />
      </SafeAreaView>
    </PlannerStylesContext.Provider>
  );
}

type BacklogPanelProps = {
  lists: RemoteList[];
  activeListId: string | null;
  onSelectList: (listId: string) => void;
  tasks: LocalTask[];
  isLoading: boolean;
  onAddTask: (title: string) => Promise<void>;
  onToggleTask: (task: LocalTask) => Promise<void>;
  onBeginSchedule: (task: LocalTask) => void;
  onCreateList: () => void;
  onOpenTask: (task: LocalTask) => void;
};

function BacklogPanel({
  lists,
  activeListId,
  onSelectList,
  tasks,
  isLoading,
  onAddTask,
  onToggleTask,
  onBeginSchedule,
  onCreateList,
  onOpenTask,
}: BacklogPanelProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  const activeList = lists.find((list) => list.id === activeListId) ?? lists[0];
  return (
    <View style={styles.backlogPanel}>
      <Text style={styles.panelEyebrow}>Lists</Text>
      <ScrollView style={styles.drawerListScroll}>
        {lists.map((list) => {
          const active = list.id === activeList?.id;
          return (
            <Pressable
              key={list.id}
              onPress={() => onSelectList(list.id)}
              style={[styles.drawerListItem, active && styles.drawerListItemActive]}
            >
              <Text style={[styles.drawerListLabel, active && styles.drawerListLabelActive]} numberOfLines={1}>
                {list.name ?? "Untitled"}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.newListButton} onPress={onCreateList}>
          <Ionicons name="add" size={14} color={colors.accentMuted} />
          <Text style={styles.newListButtonText}>New List</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.drawerTasks}>
        <Text style={styles.drawerTasksTitle}>{activeList?.name ?? "Inbox"}</Text>
        <AddTaskInput placeholder={`Add to ${activeList?.name ?? "Inbox"}`} onSubmit={onAddTask} />
        {isLoading ? (
          <ActivityIndicator color={colors.accentMuted} />
        ) : (
          <FlashList
            data={tasks}
            estimatedItemSize={64}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ListTaskItem
                task={item}
                onToggle={onToggleTask}
                onPress={() => onOpenTask(item)}
                subtitle={item.notes ?? undefined}
                onBeginDrag={onBeginSchedule}
              />
            )}
            ListEmptyComponent={<Text style={styles.emptyListText}>No tasks yet</Text>}
          />
        )}
      </View>
    </View>
  );
}

type PlannerHeroProps = {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  rangeLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenSettings: () => void;
};

function PlannerHero({
  viewMode,
  onChangeViewMode,
  rangeLabel,
  onPrev,
  onNext,
  onToday,
  onOpenSettings,
}: PlannerHeroProps) {
  const styles = usePlannerStyles();
  return (
    <View style={styles.heroBar}>
      <View style={styles.heroLeft}>
        <Text style={styles.heroEyebrow}>Planner</Text>
        <Text style={styles.heroRange}>{rangeLabel}</Text>
      </View>
      <View style={styles.heroControls}>
        <View style={styles.navGroup}>
          <IconButton icon="chevron-back" onPress={onPrev} />
          <Pressable style={styles.todayButton} onPress={onToday}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
          <IconButton icon="chevron-forward" onPress={onNext} />
        </View>
        <SegmentedControl
          size="sm"
          options={[
            { label: "Calendar", value: "calendar" },
            { label: "Tasks", value: "tasks" },
          ]}
          value={viewMode}
          onChange={(next) => onChangeViewMode(next as ViewMode)}
        />
        <IconButton icon="person-circle" onPress={onOpenSettings} />
      </View>
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      style={[styles.iconButton, disabled && styles.iconButtonDisabled]}
      onPress={!disabled ? onPress : undefined}
    >
      <Ionicons name={icon} size={16} color={disabled ? colors.textMuted : colors.text} />
    </Pressable>
  );
}

type TaskPlannerBoardProps = {
  days: PlannerDay[];
  tasksByDay: Record<string, LocalTask[]>;
  pendingTask: LocalTask | null;
  onDropPending: (dayKey: string) => Promise<void>;
  onAddTask: (dayKey: string, title: string) => Promise<void>;
  onToggleTask: (task: LocalTask) => Promise<void>;
  onOpenTask: (task: LocalTask) => void;
  onSelectDay: (dayKey: string) => void;
  selectedDayKey: string;
  onReachPast?: () => void;
  onReachFuture?: () => void;
};

function TaskPlannerBoard({
  days,
  tasksByDay,
  pendingTask,
  onDropPending,
  onAddTask,
  onToggleTask,
  onOpenTask,
  onSelectDay,
  selectedDayKey,
  onReachPast,
  onReachFuture,
}: TaskPlannerBoardProps) {
  const styles = usePlannerStyles();
  return (
    <FlashList
      horizontal
      data={days}
      estimatedItemSize={DAY_COLUMN_WIDTH + 16}
      keyExtractor={(day) => day.key}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.taskBoardRow}
      onEndReached={onReachFuture}
      onEndReachedThreshold={0.4}
      onStartReached={onReachPast}
      onStartReachedThreshold={0.4}
      renderItem={({ item: day }) => {
        const dayTasks = tasksByDay[day.key] ?? [];
        const isSelected = day.key === selectedDayKey;
        return (
          <View style={[styles.taskColumn, isSelected && styles.taskColumnSelected]}>
            <Pressable style={styles.taskColumnHeader} onPress={() => onSelectDay(day.key)}>
              <Text style={styles.taskColumnDay}>{day.weekday}</Text>
              <Text style={styles.taskColumnDate}>{`${day.monthText} ${day.dayNumber}`}</Text>
            </Pressable>
            {pendingTask ? (
              <Pressable style={styles.dropZone} onPress={() => onDropPending(day.key)}>
                <Text style={styles.dropZoneLabel}>Drop “{pendingTask.title}” here</Text>
              </Pressable>
            ) : null}
            {dayTasks.map((task) => (
              <TaskCard key={task.id} task={task} onToggleStatus={onToggleTask} onPress={() => onOpenTask(task)} />
            ))}
            <AddTaskInput placeholder="Add a task" onSubmit={(title) => onAddTask(day.key, title)} />
          </View>
        );
      }}
    />
  );
}

type WeekCalendarGridProps = {
  days: PlannerDay[];
  tasksByDay: Record<string, LocalTask[]>;
  pendingTask: LocalTask | null;
  onDropPendingIntoDay: (dayKey: string) => Promise<void>;
  onDropPendingIntoSlot: (dayKey: string, hour: number) => Promise<void>;
  onOpenTask: (task: LocalTask) => void;
  onToggleTask: (task: LocalTask) => Promise<void>;
  onSelectDay: (dayKey: string) => void;
  selectedDayKey: string;
  gridHeight: number;
};

function WeekCalendarGrid({
  days,
  tasksByDay,
  pendingTask,
  onDropPendingIntoDay,
  onDropPendingIntoSlot,
  onOpenTask,
  onToggleTask,
  onSelectDay,
  selectedDayKey,
  gridHeight,
}: WeekCalendarGridProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarGridWrapper}>
      <View style={styles.calendarGrid}>
        <View style={styles.calendarGridHeader}>
          <View style={styles.calendarGridCorner}>
            {pendingTask ? (
              <Pressable onPress={() => onDropPendingIntoDay(days[0]?.key ?? "")}>
                <Text style={styles.bannerLink}>Place “{pendingTask.title}” at start</Text>
              </Pressable>
            ) : null}
          </View>
          {days.map((day) => (
            <Pressable
              key={day.key}
              style={[
                styles.calendarHeaderCell,
                day.key === selectedDayKey && styles.calendarHeaderCellSelected,
              ]}
              onPress={() => onSelectDay(day.key)}
            >
              <Text style={styles.calendarHeaderDay}>{day.weekday}</Text>
              <Text style={styles.calendarHeaderDate}>{`${day.monthText} ${day.dayNumber}`}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          style={[styles.calendarGridScroll, { height: gridHeight }]}
          showsVerticalScrollIndicator={false}
        >
          {HOURS.map((hour) => (
            <View key={hour} style={styles.calendarGridRow}>
              <View style={styles.calendarGridHour}>
                <Text style={styles.calendarHourText}>{formatHourLabel(hour)}</Text>
              </View>
              {days.map((day) => {
                const hourTasks = (tasksByDay[day.key] ?? []).filter((task) => {
                  if (!task.planned_start) return false;
                  return new Date(task.planned_start).getHours() === hour;
                });
                return (
                  <Pressable
                    key={`${day.key}-${hour}`}
                    style={[
                      styles.calendarGridCell,
                      day.key === selectedDayKey && styles.calendarGridCellSelected,
                    ]}
                    onPress={() => (pendingTask ? onDropPendingIntoSlot(day.key, hour) : undefined)}
                  >
                    {hourTasks.map((task) => (
                      <Pressable key={task.id} style={styles.calendarBlock} onPress={() => onOpenTask(task)}>
                        <Text style={styles.calendarBlockText}>{task.title}</Text>
                        <Pressable onPress={() => onToggleTask(task)}>
                          <Ionicons
                            name={task.status === "done" ? "checkmark-circle" : "ellipse-outline"}
                            size={14}
                            color={task.status === "done" ? colors.successAlt : colors.textSecondary}
                          />
                        </Pressable>
                      </Pressable>
                    ))}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

type DailyTaskPanelProps = {
  day: PlannerDay | undefined;
  tasks: LocalTask[];
  onAddTask: (title: string) => Promise<void>;
  onToggleTask: (task: LocalTask) => Promise<void>;
  onOpenTask: (task: LocalTask) => void;
  onStepDay: (delta: number) => void;
  onToday: () => void;
  disablePrev: boolean;
  disableNext: boolean;
};

function DailyTaskPanel({
  day,
  tasks,
  onAddTask,
  onToggleTask,
  onOpenTask,
  onStepDay,
  onToday,
  disablePrev,
  disableNext,
}: DailyTaskPanelProps) {
  const styles = usePlannerStyles();
  if (!day) return null;
  return (
    <View style={styles.timeboxPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Tasks</Text>
        <View style={styles.panelNav}>
          <IconButton icon="chevron-back" onPress={() => onStepDay(-1)} disabled={disablePrev} />
          <Pressable style={styles.todayButton} onPress={onToday}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
          <IconButton icon="chevron-forward" onPress={() => onStepDay(1)} disabled={disableNext} />
        </View>
      </View>
      <Text style={styles.timeboxDate}>{`${day.weekday}, ${day.monthText} ${day.dayNumber}`}</Text>
      <AddTaskInput placeholder="Add timed task" onSubmit={onAddTask} />
      <ScrollView style={styles.timeboxList}>
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onToggleStatus={onToggleTask} onPress={() => onOpenTask(task)} />
        ))}
      </ScrollView>
    </View>
  );
}

type DailySchedulePanelProps = {
  day: PlannerDay | undefined;
  tasks: LocalTask[];
  pendingTask: LocalTask | null;
  onDropPendingIntoSlot: (dayKey: string, hour: number) => Promise<void>;
  onOpenTask: (task: LocalTask) => void;
  onToggleTask: (task: LocalTask) => Promise<void>;
  onStepDay: (delta: number) => void;
  disablePrev: boolean;
  disableNext: boolean;
  onToday: () => void;
};

function DailySchedulePanel({
  day,
  tasks,
  pendingTask,
  onDropPendingIntoSlot,
  onOpenTask,
  onToggleTask,
  onStepDay,
  disablePrev,
  disableNext,
  onToday,
}: DailySchedulePanelProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  if (!day) return null;
  return (
    <View style={styles.timeboxPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Schedule</Text>
        <View style={styles.panelNav}>
          <IconButton icon="chevron-back" onPress={() => onStepDay(-1)} disabled={disablePrev} />
          <Pressable style={styles.todayButton} onPress={onToday}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
          <IconButton icon="chevron-forward" onPress={() => onStepDay(1)} disabled={disableNext} />
        </View>
      </View>
      <Text style={styles.timeboxDate}>{`${day.weekday}, ${day.monthText} ${day.dayNumber}`}</Text>
      <ScrollView
        style={styles.dayScheduleScroll}
        contentContainerStyle={styles.dayScheduleScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {HOURS.map((hour, index) => {
          const isLastHour = index === HOURS.length - 1;
          const hourTasks = tasks.filter((task) => {
            if (!task.planned_start) return false;
            return new Date(task.planned_start).getHours() === hour;
          });
          return (
            <View
              key={`${day.key}-${hour}`}
              style={[styles.dayScheduleRow, isLastHour && styles.dayScheduleRowLast]}
            >
              <View style={styles.dayScheduleHour}>
                <Text style={styles.calendarHourText}>{formatHourLabel(hour)}</Text>
              </View>
              <Pressable
                style={styles.dayScheduleCell}
                onPress={() => (pendingTask ? onDropPendingIntoSlot(day.key, hour) : undefined)}
              >
                {hourTasks.map((task) => (
                  <Pressable key={task.id} style={styles.calendarBlock} onPress={() => onOpenTask(task)}>
                    <Text style={styles.calendarBlockText}>{task.title}</Text>
                    <Pressable onPress={() => onToggleTask(task)}>
                      <Ionicons
                        name={task.status === "done" ? "checkmark-circle" : "ellipse-outline"}
                        size={14}
                        color={task.status === "done" ? colors.successAlt : colors.textSecondary}
                      />
                    </Pressable>
                  </Pressable>
                ))}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

type CreateListModalProps = {
  visible: boolean;
  value: string;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
};

function CreateListModal({ visible, value, onChangeValue, onClose, onSubmit, loading }: CreateListModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>New List</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="List name"
            placeholderTextColor={colors.placeholder}
            value={value}
            onChangeText={onChangeValue}
            autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.modalGhostButton}>
              <Text style={styles.modalGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalPrimaryButton, (!value.trim() || loading) && styles.modalPrimaryDisabled]}
              disabled={!value.trim() || loading}
              onPress={onSubmit}
            >
              {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.modalPrimaryText}>Create</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type AppSettingsModalProps = {
  visible: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  onOpenFullSettings: () => void;
};

function AppSettingsModal({ visible, onClose, userName, userEmail, onOpenFullSettings }: AppSettingsModalProps) {
  const initials = userName
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  const styles = usePlannerStyles();
  const { preference, setPreference } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [rollover, setRollover] = useState(true);
  const [autoTheme, setAutoTheme] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.settingsModalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.settingsHeader}>
            <View style={styles.settingsAvatar}>
              <Text style={styles.settingsAvatarText}>{initials || "U"}</Text>
            </View>
            <View>
              <Text style={styles.settingsUserName}>{userName}</Text>
              <Text style={styles.settingsUserEmail}>{userEmail}</Text>
            </View>
          </View>
          <ScrollView style={styles.settingsModalScroll} contentContainerStyle={styles.settingsModalScrollContent}>
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Appearance</Text>
              <SegmentedControl
                size="sm"
                value={preference}
                options={[
                  { label: "System", value: "system" },
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                ]}
                onChange={(next) => setPreference(next as typeof preference)}
              />
              <SettingsToggleRow
                label="Auto-dark mode at sunset"
                value={autoTheme}
                onValueChange={setAutoTheme}
              />
            </View>
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Behaviors</Text>
              <SettingsToggleRow
                label="Roll over incomplete tasks"
                value={rollover}
                onValueChange={setRollover}
              />
              <SettingsToggleRow
                label="Notifications"
                value={notifications}
                onValueChange={setNotifications}
              />
            </View>
          </ScrollView>
          <View style={styles.modalActions}>
            <Pressable onPress={onOpenFullSettings} style={styles.modalPrimaryButton}>
              <Text style={styles.modalPrimaryText}>Open settings</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.modalGhostButton}>
              <Text style={styles.modalGhostText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type TaskDetailModalProps = {
  taskId: string | null;
  onClose: () => void;
};

function TaskDetailModal({ taskId, onClose }: TaskDetailModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={Boolean(taskId)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.taskDetailModalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.taskDetailHeader}>
            <Text style={styles.taskDetailTitle}>Task Details</Text>
            <Pressable onPress={onClose} style={styles.taskDetailClose}>
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>
          {taskId ? (
            <TaskDetailView taskId={taskId} scrollStyle={styles.taskDetailScroll} contentStyle={styles.taskDetailContent} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SettingsToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.settingsToggleRow}>
      <Text style={styles.settingsToggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={colors.surface}
        trackColor={{ true: colors.accent, false: colors.borderMuted }}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
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
  },
  drawerListItemActive: {
    backgroundColor: colors.border,
  },
  drawerListLabel: {
    color: colors.textMuted,
    fontWeight: "500",
  },
  drawerListLabelActive: {
    color: colors.accentMuted,
    fontWeight: "600",
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
  },
  centerPane: {
    flex: 1,
    backgroundColor: colors.panelBackground,
    paddingHorizontal: 24,
    paddingVertical: 24,
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
  calendarGridRow: {
    flexDirection: "row",
  },
  calendarGridHour: {
    width: 90,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: "center",
  },
  calendarHourText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  calendarGridCell: {
    width: 160,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    padding: 6,
    minHeight: 60,
    gap: 6,
  },
  calendarGridCellSelected: {
    backgroundColor: colors.surfaceElevated,
  },
  calendarBlock: {
    borderRadius: 12,
    padding: 8,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarBlockText: {
    color: colors.text,
    flex: 1,
    marginRight: 8,
    fontSize: 12,
  },
  timeboxPanel: {
    width: 320,
    padding: 20,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderColor: colors.border,
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
  dayScheduleScrollContent: {
    flexGrow: 1,
  },
  dayScheduleRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  dayScheduleRowLast: {
    borderBottomWidth: 0,
  },
  dayScheduleHour: {
    width: 72,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  dayScheduleCell: {
    flex: 1,
    padding: 8,
    minHeight: 52,
    gap: 6,
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
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  settingsModalScroll: {
    maxHeight: 420,
  },
  settingsModalScrollContent: {
    gap: 20,
  },
  settingsSection: {
    gap: 12,
  },
  settingsSectionTitle: {
    color: colors.text,
    fontWeight: "600",
  },
  settingsToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  settingsToggleLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
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
