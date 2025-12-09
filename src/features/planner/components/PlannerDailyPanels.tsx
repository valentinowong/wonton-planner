import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { AddTaskInput } from "../../../components/ui/AddTaskInput";
import { TaskCard } from "../../../components/data-display/TaskCard";
import { usePlannerStyles } from "../state/PlannerStylesContext";
import { PlannerIconButton } from "./PlannerIconButton";
import type { LocalTask } from "../../../data/local/db";
import type { PlannerDay } from "../types";
import { useTheme } from "../../../theme/ThemeContext";
import { formatHourLabel, HOURS, HOUR_BLOCK_HEIGHT } from "../utils/time";
import { getTaskTimeMetrics } from "../utils/taskTime";
import { formatDuration, formatTaskStartTime } from "../utils/taskDisplay";
import { resolvePlannerDropTarget, type PlannerListHoverTarget } from "./drag/dropTargets";
import type { PlannerDragPreview } from "../types";

type PlannerDailyTaskPanelProps = {
  day: PlannerDay | undefined;
  tasks: LocalTask[];
  onAddTask: (title: string) => Promise<void>;
  onToggleTask: (task: LocalTask) => Promise<void>;
  onOpenTask: (task: LocalTask) => void;
  onStepDay: (delta: number) => void;
  onToday: () => void;
  disablePrev: boolean;
  disableNext: boolean;
  dropHover?: boolean;
  onDragPreviewChange?: (preview: PlannerDragPreview | null) => void;
  onListHoverChange?: (target: PlannerListHoverTarget | null) => void;
  onDayHoverChange?: (dayKey: string | null) => void;
  onCalendarPreviewChange?: (preview: { task: LocalTask; dayKey: string; startMinutes: number } | null) => void;
  onDropTaskOnList?: (
    task: LocalTask,
    listId: string,
    targetTaskId?: string | null,
    position?: "before" | "after",
  ) => void | Promise<void>;
  onDropTaskOnDay?: (task: LocalTask, dayKey: string, startMinutes?: number, endMinutes?: number) => void | Promise<void>;
};

export function PlannerDailyTaskPanel({
  day,
  tasks,
  onAddTask,
  onToggleTask,
  onOpenTask,
  onStepDay,
  onToday,
  disablePrev,
  disableNext,
  dropHover = false,
  onDragPreviewChange,
  onListHoverChange,
  onDayHoverChange,
  onCalendarPreviewChange,
  onDropTaskOnList,
  onDropTaskOnDay,
}: PlannerDailyTaskPanelProps) {
  const styles = usePlannerStyles();
  if (!day) return null;

  const draggingTaskRef = useRef<LocalTask | null>(null);

  const handleDragStart = useCallback(
    (task: LocalTask, x: number, y: number) => {
      draggingTaskRef.current = task;
      onCalendarPreviewChange?.(null);
      onDragPreviewChange?.({ task, x, y });
    },
    [onCalendarPreviewChange, onDragPreviewChange],
  );

  const handleDragMove = useCallback(
    (x: number, y: number) => {
      const task = draggingTaskRef.current;
      if (!task) return;
      let previewVariant: PlannerDragPreview["variant"] = "backlog";
      if (Platform.OS !== "web") {
        onDragPreviewChange?.({ task, x, y, variant: previewVariant });
        return;
      }
      const target = resolvePlannerDropTarget(x, y, task.id);
      if (target?.type === "calendarSlot") {
        previewVariant = "calendar";
        onCalendarPreviewChange?.({
          task,
          dayKey: target.dayKey,
          startMinutes: target.hour * 60,
        });
        onDayHoverChange?.(target.dayKey);
        onListHoverChange?.(null);
        onDragPreviewChange?.({ task, x, y, variant: previewVariant });
        return;
      }
      if (target?.type === "day") {
        previewVariant = target.origin === "taskBoard" ? "taskBoard" : "backlog";
        onCalendarPreviewChange?.(null);
        onDayHoverChange?.(target.dayKey);
        onListHoverChange?.(null);
        onDragPreviewChange?.({ task, x, y, variant: previewVariant });
        return;
      } else if (target?.type === "list" || target?.type === "task") {
        onCalendarPreviewChange?.(null);
        onDayHoverChange?.(null);
        onListHoverChange?.(
          target.type === "list"
            ? target
            : { type: "task", listId: target.listId, taskId: target.taskId, position: target.position },
        );
        onDragPreviewChange?.({ task, x, y, variant: previewVariant });
        return;
      } else {
        onCalendarPreviewChange?.(null);
        onDayHoverChange?.(null);
        onListHoverChange?.(null);
      }
      onDragPreviewChange?.({ task, x, y, variant: previewVariant });
    },
    [onCalendarPreviewChange, onDayHoverChange, onDragPreviewChange, onListHoverChange],
  );

  const finalizeDrag = useCallback(
    (commit: boolean, x?: number, y?: number) => {
      const task = draggingTaskRef.current;
      draggingTaskRef.current = null;
      const target =
        Platform.OS === "web" && x !== undefined && y !== undefined
          ? resolvePlannerDropTarget(x, y, task?.id ?? undefined)
          : null;
      onCalendarPreviewChange?.(null);
      onDragPreviewChange?.(null);
      onDayHoverChange?.(null);
      onListHoverChange?.(null);
      if (!commit || !task || !target) return;
      if (target.type === "calendarSlot" && onDropTaskOnDay) {
        const metrics = getTaskTimeMetrics(task);
        const duration = Math.max(15, metrics?.durationMinutes ?? task.estimate_minutes ?? 60);
        const startMinutes = target.hour * 60;
        const endMinutes = Math.min(startMinutes + duration, 24 * 60);
        onDropTaskOnDay(task, target.dayKey, startMinutes, endMinutes);
        return;
      }
      if (target.type === "day" && onDropTaskOnDay) {
        onDropTaskOnDay(task, target.dayKey);
      } else if (onDropTaskOnList && (target.type === "list" || target.type === "task")) {
        onDropTaskOnList(
          task,
          target.listId,
          target.type === "task" ? target.taskId : null,
          target.type === "task" ? target.position : undefined,
        );
      }
    },
    [onCalendarPreviewChange, onDayHoverChange, onDragPreviewChange, onDropTaskOnDay, onDropTaskOnList, onListHoverChange],
  );

  const handleDragEnd = useCallback(
    (x: number, y: number) => {
      finalizeDrag(true, x, y);
    },
    [finalizeDrag],
  );

  const handleDragCancel = useCallback(() => {
    finalizeDrag(false);
  }, [finalizeDrag]);

  return (
    <View
      style={[styles.timeboxPanel, dropHover && styles.timeboxPanelDropTarget]}
      dataSet={{ dragTarget: "dailyTaskList", dayKey: day.key }}
      collapsable={false}
    >
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Tasks</Text>
        <View style={styles.panelNav}>
          <PlannerIconButton icon="chevron-back" onPress={() => onStepDay(-1)} disabled={disablePrev} />
          <Pressable style={styles.todayButton} onPress={onToday}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
          <PlannerIconButton icon="chevron-forward" onPress={() => onStepDay(1)} disabled={disableNext} />
        </View>
      </View>
      <Text style={styles.timeboxDate}>{`${day.weekday}, ${day.monthText} ${day.dayNumber}`}</Text>
      <AddTaskInput placeholder="Add task" onSubmit={onAddTask} />
      <ScrollView style={styles.timeboxList}>
        {tasks.map((task) => {
          const metrics = getTaskTimeMetrics(task);
          const durationMinutes = metrics?.durationMinutes ?? task.estimate_minutes ?? null;
          const badgeText = durationMinutes ? formatDuration(durationMinutes) : null;
          const detailText = formatTaskStartTime(task);
          return (
            <DraggableDailyTaskCard
              key={task.id}
              task={task}
              onToggleStatus={onToggleTask}
              onOpenTask={onOpenTask}
              badgeText={badgeText}
              detailText={detailText}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

type PlannerDailySchedulePanelProps = {
  day: PlannerDay | undefined;
  tasks: LocalTask[];
  pendingTask: LocalTask | null;
  onDropPendingIntoSlot: (dayKey: string, hour: number) => Promise<void>;
  onOpenTask: (task: LocalTask) => void;
  onToggleTask: (task: LocalTask) => Promise<void>;
  onResizeTask: (task: LocalTask, dayKey: string, startMinutes: number, endMinutes: number) => void | Promise<void>;
  onStepDay: (delta: number) => void;
  disablePrev: boolean;
  disableNext: boolean;
  onToday: () => void;
  externalPreview?: { task: LocalTask; dayKey: string; startMinutes: number } | null;
  onDragPreviewChange?: (preview: PlannerDragPreview | null) => void;
  onDayHoverChange?: (dayKey: string | null) => void;
  onListHoverChange?: (target: PlannerListHoverTarget | null) => void;
  onDropTaskOnDay?: (task: LocalTask, dayKey: string, startMinutes?: number, endMinutes?: number) => void | Promise<void>;
  onDropTaskOnList?: (
    task: LocalTask,
    listId: string,
    targetTaskId?: string | null,
    position?: "before" | "after",
  ) => void | Promise<void>;
};

type PositionedTask = {
  id: string;
  start: number;
  end: number;
  hidden?: boolean;
};

function computeOverlapLayout(tasks: PositionedTask[]): Record<string, { column: number; columns: number }> {
  const sorted = [...tasks].filter((t) => !t.hidden).sort((a, b) => a.start - b.start || a.end - b.end);
  const layout: Record<string, { column: number; columns: number }> = {};
  const active: { id: string; end: number; column: number }[] = [];

  sorted.forEach((task) => {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= task.start) {
        active.splice(i, 1);
      }
    }
    const used = new Set(active.map((a) => a.column));
    let column = 0;
    while (used.has(column)) column += 1;
    active.push({ id: task.id, end: task.end, column });
    const currentCols = Math.max(column + 1, active.length);
    active.forEach((item) => {
      layout[item.id] = { column: item.column, columns: currentCols };
    });
  });

  return layout;
}

export function PlannerDailySchedulePanel({
  day,
  tasks,
  pendingTask,
  onDropPendingIntoSlot,
  onOpenTask,
  onToggleTask,
  onResizeTask,
  onStepDay,
  disablePrev,
  disableNext,
  onToday,
  externalPreview,
  onDragPreviewChange,
  onDayHoverChange,
  onListHoverChange,
  onDropTaskOnDay,
  onDropTaskOnList,
}: PlannerDailySchedulePanelProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragExternal, setDragExternal] = useState(false);
  const hoverTargetRef = useRef<ReturnType<typeof resolvePlannerDropTarget> | null>(null);
  const scheduleColumnRef = useRef<View | null>(null);
  const scheduleBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [scheduleWidth, setScheduleWidth] = useState<number | null>(null);

  const beginResize = useCallback(
    (event: GestureResponderEvent, task: LocalTask, metrics: TaskMetrics, edge: ResizeEdge) => {
      if (Platform.OS !== "web" || !day) return;
      event.stopPropagation();
      event.preventDefault?.();
      const endMinutes = metrics.startMinutes + metrics.durationMinutes;
      const originY = event.nativeEvent.pageY ?? event.nativeEvent.clientY ?? 0;
      setResizeState({
        task,
        dayKey: day.key,
        edge,
        startMinutes: metrics.startMinutes,
        endMinutes,
        currentStart: metrics.startMinutes,
        currentEnd: endMinutes,
        originY,
      });
    },
    [day],
  );

  const handleResizeMove = useCallback((event: GestureResponderEvent) => {
    setResizeState((prev) => {
      if (!prev) return prev;
      const pageY = event.nativeEvent.pageY ?? event.nativeEvent.clientY ?? 0;
      const deltaMinutes = ((pageY - prev.originY) / HOUR_BLOCK_HEIGHT) * 60;
      const snappedDelta = Math.round(deltaMinutes / 15) * 15;
      let nextStart = prev.startMinutes;
      let nextEnd = prev.endMinutes;
      if (prev.edge === "start") {
        nextStart = Math.max(0, Math.min(nextEnd - 15, prev.startMinutes + snappedDelta));
      } else {
        nextEnd = Math.min(24 * 60, Math.max(nextStart + 15, prev.endMinutes + snappedDelta));
      }
      if (nextStart === prev.currentStart && nextEnd === prev.currentEnd) return prev;
      return { ...prev, currentStart: nextStart, currentEnd: nextEnd };
    });
  }, []);

  const finishResize = useCallback(
    (commit: boolean) => {
      setResizeState((prev) => {
        if (!prev) return null;
        const start = prev.currentStart ?? prev.startMinutes;
        const end = prev.currentEnd ?? prev.endMinutes;
        if (commit && (start !== prev.startMinutes || end !== prev.endMinutes)) {
          onResizeTask(prev.task, prev.dayKey, start, end);
        }
        return null;
      });
    },
    [onResizeTask],
  );

  const beginDrag = useCallback(
    (task: LocalTask, metrics: TaskMetrics, originX: number, originY: number) => {
      if (Platform.OS !== "web" || !day) return;
      setDragExternal(false);
      scheduleColumnRef.current?.measureInWindow?.((x, y, width, height) => {
        scheduleBoundsRef.current = { x, y, width, height };
      });
      setDragState({
        task,
        dayKey: day.key,
        startMinutes: metrics.startMinutes,
        durationMinutes: metrics.durationMinutes,
        currentStart: metrics.startMinutes,
        originX,
        originY,
        dragging: false,
      });
      onDragPreviewChange?.({ task, x: originX, y: originY, variant: "calendar" });
      hoverTargetRef.current = null;
    },
    [day, onDragPreviewChange],
  );

  const handleDragMove = useCallback(
    (task: LocalTask, x: number, y: number) => {
      if (Platform.OS !== "web" || !day) return;

      const bounds = scheduleBoundsRef.current;
      const insideSchedule =
        bounds && x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;

      setDragState((prev) => {
        if (!prev) return prev;
        const deltaY = y - prev.originY;
        const deltaMinutes = Math.round(((deltaY / HOUR_BLOCK_HEIGHT) * 60) / 15) * 15;
        const newStart = clampMinutes(prev.startMinutes + deltaMinutes, 0, 24 * 60 - prev.durationMinutes);
        const dragging = prev.dragging || Math.abs(deltaY) > 6 || Math.abs(x - prev.originX) > 6;
        if (newStart === prev.currentStart && dragging === prev.dragging) return prev;
        return { ...prev, currentStart: newStart, dragging };
      });

      if (insideSchedule) {
        setDragExternal(false);
        hoverTargetRef.current = null;
        onDayHoverChange?.(null);
        onListHoverChange?.(null);
        onDragPreviewChange?.(null);
        return;
      }

      const target = resolvePlannerDropTarget(x, y, task.id);
      hoverTargetRef.current = target;
      let previewVariant: PlannerDragPreview["variant"] = "calendar";
      if (target?.type === "day") {
        const isTaskBoardColumn = target.origin === "taskBoard";
        previewVariant = isTaskBoardColumn ? "taskBoard" : "calendar";
        setDragExternal(Boolean(isTaskBoardColumn));
        onDayHoverChange?.(target.dayKey);
        onListHoverChange?.(null);
        onDragPreviewChange?.({ task, x, y, variant: previewVariant });
        return;
      }
      if (target?.type === "list" || target?.type === "task") {
        setDragExternal(true);
        onDayHoverChange?.(null);
        onListHoverChange?.(
          target.type === "list"
            ? target
            : { type: "task", listId: target.listId, taskId: target.taskId, position: target.position },
        );
        onDragPreviewChange?.({ task, x, y, variant: "backlog" });
        return;
      }
      setDragExternal(false);
      onDayHoverChange?.(null);
      onListHoverChange?.(null);
      onDragPreviewChange?.({ task, x, y, variant: previewVariant });
    },
    [day, onDayHoverChange, onDragPreviewChange, onListHoverChange],
  );

  const finishDrag = useCallback(
    (commit: boolean, coords?: { x: number; y: number }) => {
      const target =
        Platform.OS === "web" && coords
          ? resolvePlannerDropTarget(coords.x, coords.y, dragState?.task.id)
          : hoverTargetRef.current;
      hoverTargetRef.current = null;
      onDragPreviewChange?.(null);
      onDayHoverChange?.(null);
      onListHoverChange?.(null);
      setDragExternal(false);

      setDragState((prev) => {
        if (!prev) return null;
        if (commit && target) {
          if (target.type === "calendarSlot") {
            const start = target.dayKey === prev.dayKey ? prev.currentStart : target.hour * 60;
            const end = Math.min(start + prev.durationMinutes, 24 * 60);
            if (onDropTaskOnDay) {
              onDropTaskOnDay(prev.task, target.dayKey, start, end);
            } else {
              onResizeTask(prev.task, prev.dayKey, start, end);
            }
            return null;
          }
          if (target.type === "day" && onDropTaskOnDay) {
            onDropTaskOnDay(prev.task, target.dayKey, prev.currentStart, prev.currentStart + prev.durationMinutes);
            return null;
          }
          if (target.type !== "day" && target.type !== "calendarSlot" && onDropTaskOnList) {
            const targetTaskId = target.type === "task" ? target.taskId : null;
            const position = target.type === "task" ? target.position : undefined;
            onDropTaskOnList(prev.task, target.listId, targetTaskId, position);
            return null;
          }
        }
        if (commit && prev.dragging) {
          const start = prev.currentStart;
          const end = start + prev.durationMinutes;
          onResizeTask(prev.task, prev.dayKey, start, end);
        } else if (commit && !prev.dragging) {
          onOpenTask(prev.task);
        }
        return null;
      });
    },
    [dragState, onDayHoverChange, onDragPreviewChange, onDropTaskOnDay, onDropTaskOnList, onListHoverChange, onOpenTask, onResizeTask],
  );

  if (!day) return null;
  const scheduledTasks = tasks.filter((task) => Boolean(task.planned_start));

  return (
    <View style={styles.timeboxPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Schedule</Text>
        <View style={styles.panelNav}>
          <PlannerIconButton icon="chevron-back" onPress={() => onStepDay(-1)} disabled={disablePrev} />
          <Pressable style={styles.todayButton} onPress={onToday}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
          <PlannerIconButton icon="chevron-forward" onPress={() => onStepDay(1)} disabled={disableNext} />
        </View>
      </View>
      <Text style={styles.timeboxDate}>{`${day.weekday}, ${day.monthText} ${day.dayNumber}`}</Text>
      <ScrollView style={styles.dayScheduleScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.dayScheduleGrid}>
          <View style={styles.calendarHoursColumn}>
            {HOURS.map((hour, index) => (
              <View key={`${day.key}-hour-${hour}`} style={[styles.calendarHourRow, index === HOURS.length - 1 && styles.calendarHourRowLast]}>
                <Text style={styles.calendarHourText}>{formatHourLabel(hour)}</Text>
              </View>
            ))}
          </View>
          <View
            style={styles.dayScheduleColumn}
            dataSet={{ dragTarget: "calendarDay", dayKey: day.key }}
            collapsable={false}
            ref={scheduleColumnRef}
          >
            <View style={styles.dayScheduleSlots}>
              {HOURS.map((hour, index) => (
                <Pressable
                  key={`${day.key}-slot-${hour}`}
                  style={[styles.dayScheduleSlot, index === HOURS.length - 1 && styles.dayScheduleSlotLast]}
                  onPress={() => (pendingTask ? onDropPendingIntoSlot(day.key, hour) : undefined)}
                  dataSet={{ dragTarget: "calendarSlot", dayKey: day.key, hour: String(hour) }}
                  collapsable={false}
                />
              ))}
            </View>
            {externalPreview && externalPreview.dayKey === day.key ? (
              <View
                style={[
                  styles.calendarBlock,
                  styles.calendarBlockFloating,
                  styles.calendarBlockDragging,
                  {
                    top: (externalPreview.startMinutes / 60) * HOUR_BLOCK_HEIGHT,
                    height: Math.max(
                      28,
                      ((getTaskPreviewDuration(externalPreview.task) / 60) || 1) * HOUR_BLOCK_HEIGHT,
                    ),
                  },
                  Platform.OS === "web" ? { pointerEvents: "none" } : null,
                ]}
                pointerEvents={Platform.OS === "web" ? undefined : "none"}
              >
                <Text style={styles.calendarBlockText} numberOfLines={2}>
                  {externalPreview.task.title}
                </Text>
              </View>
            ) : null}
            <View
              style={[
                styles.dayScheduleTasks,
                { height: HOURS.length * HOUR_BLOCK_HEIGHT },
                Platform.OS === "web" ? { pointerEvents: "box-none" } : null,
              ]}
              pointerEvents={Platform.OS === "web" ? undefined : "box-none"}
              dataSet={{ dragTarget: "calendarDay", dayKey: day.key }}
              collapsable={false}
              onLayout={(e) => setScheduleWidth(e.nativeEvent.layout.width)}
            >
              {(() => {
                const taskPositions: PositionedTask[] = scheduledTasks.map((task) => {
                  const metrics = getTaskTimeMetrics(task);
                  if (!metrics) return { id: task.id, start: 0, end: 0, hidden: true };
                  const isResizing = resizeState?.task.id === task.id;
                  const startMinutes = isResizing ? resizeState.currentStart : metrics.startMinutes;
                  const endMinutes = isResizing
                    ? resizeState.currentEnd
                    : metrics.startMinutes + metrics.durationMinutes;
                  const dragActive = dragState?.task.id === task.id;
                  const hidden = dragActive && dragExternal;
                  return { id: task.id, start: startMinutes, end: endMinutes, hidden };
                });
                const layoutMap = computeOverlapLayout(taskPositions);
                return scheduledTasks.map((task) => {
                  const metrics = getTaskTimeMetrics(task);
                  if (!metrics) return null;
                  const isResizing = resizeState?.task.id === task.id;
                const startMinutes = isResizing ? resizeState.currentStart : metrics.startMinutes;
                const endMinutes = isResizing
                  ? resizeState.currentEnd
                  : metrics.startMinutes + metrics.durationMinutes;
                const adjustedDuration = Math.max(15, endMinutes - startMinutes);
                const top = (startMinutes / 60) * HOUR_BLOCK_HEIGHT;
                const height = Math.max(28, (adjustedDuration / 60) * HOUR_BLOCK_HEIGHT);
                const dragActive = dragState?.task.id === task.id;
                const translateY = dragActive
                  ? ((dragState.currentStart - metrics.startMinutes) / 60) * HOUR_BLOCK_HEIGHT
                  : 0;
                const layout = layoutMap[task.id] ?? { column: 0, columns: 1 };
                const gutter = 4;
                const availableWidth = (scheduleWidth ?? 0) || 1;
                const columnWidth = availableWidth / layout.columns;
                const width = Math.max(40, columnWidth - gutter);
                const left = layout.column * columnWidth + gutter / 2;
                  return (
                    <DailyScheduleTask
                      key={task.id}
                    task={task}
                    metrics={metrics}
                    top={top}
                    height={height}
                    translateY={translateY}
                    dragActive={dragActive}
                    isResizing={Boolean(isResizing)}
                    hidden={dragActive && dragExternal}
                    styles={styles}
                    colors={colors}
                    onOpenTask={onOpenTask}
                    onToggleTask={onToggleTask}
                    beginDrag={beginDrag}
                    handleDragMove={handleDragMove}
                    finishDrag={finishDrag}
                      beginResize={beginResize}
                      handleResizeMove={handleResizeMove}
                      finishResize={finishResize}
                      width={width}
                      left={left}
                    />
                  );
                });
              })()}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

type ResizeEdge = "start" | "end";

type TaskMetrics = {
  startMinutes: number;
  durationMinutes: number;
};

type ResizeState = {
  task: LocalTask;
  dayKey: string;
  edge: ResizeEdge;
  startMinutes: number;
  endMinutes: number;
  currentStart: number;
  currentEnd: number;
  originY: number;
};

type DragState = {
  task: LocalTask;
  dayKey: string;
  startMinutes: number;
  durationMinutes: number;
  currentStart: number;
  originX: number;
  originY: number;
  dragging: boolean;
};

function getTaskPreviewDuration(task: LocalTask): number {
  if (task.planned_start && task.planned_end) {
    const start = new Date(task.planned_start);
    const end = new Date(task.planned_end);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diff = (end.getTime() - start.getTime()) / 60000;
      if (diff > 0) return diff;
    }
  }
  return task.estimate_minutes ?? 60;
}

function clampMinutes(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type DailyScheduleTaskProps = {
  task: LocalTask;
  metrics: TaskMetrics;
  top: number;
  height: number;
  width: number;
  left: number;
  translateY: number;
  dragActive: boolean;
  isResizing: boolean;
  hidden: boolean;
  styles: ReturnType<typeof usePlannerStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
  onOpenTask: (task: LocalTask) => void;
  onToggleTask: (task: LocalTask) => Promise<void>;
  beginDrag: (task: LocalTask, metrics: TaskMetrics, originX: number, originY: number) => void;
  handleDragMove: (task: LocalTask, x: number, y: number) => void;
  finishDrag: (commit: boolean, coords?: { x: number; y: number }) => void;
  beginResize: (
    event: GestureResponderEvent,
    task: LocalTask,
    metrics: TaskMetrics,
    edge: ResizeEdge,
  ) => void;
  handleResizeMove: (event: GestureResponderEvent) => void;
  finishResize: (commit: boolean) => void;
};

function DailyScheduleTask({
  task,
  metrics,
  top,
  height,
  width,
  left,
  translateY,
  dragActive,
  isResizing,
  hidden,
  styles,
  colors,
  onOpenTask,
  onToggleTask,
  beginDrag,
  handleDragMove,
  finishDrag,
  beginResize,
  handleResizeMove,
  finishResize,
}: DailyScheduleTaskProps) {
  const shouldSkipNextPressRef = useRef(false);
  const dragGesture = useMemo(() => {
    let ended = false;
    return Gesture.Pan()
      .minDistance(6)
      .onStart((event) => {
        ended = false;
        shouldSkipNextPressRef.current = true;
        beginDrag(task, metrics, event.absoluteX, event.absoluteY);
      })
      .onUpdate((event) => {
        handleDragMove(task, event.absoluteX, event.absoluteY);
      })
      .onEnd((event) => {
        ended = true;
        finishDrag(true, { x: event.absoluteX, y: event.absoluteY });
      })
      .onFinalize((event) => {
        if (!ended) {
          finishDrag(false, event ? { x: event.absoluteX, y: event.absoluteY } : undefined);
        }
        const resetSkip = () => {
          shouldSkipNextPressRef.current = false;
        };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(resetSkip);
        } else {
          setTimeout(resetSkip, 0);
        }
      })
      .enabled(!isResizing)
      .runOnJS(true);
  }, [beginDrag, finishDrag, handleDragMove, isResizing, metrics, task]);

  const handlePress = useCallback(() => {
    if (shouldSkipNextPressRef.current || dragActive) {
      shouldSkipNextPressRef.current = false;
      return;
    }
    onOpenTask(task);
  }, [dragActive, onOpenTask, task]);

  return (
    <GestureDetector gesture={dragGesture}>
      <View
        style={[
          styles.calendarBlock,
          styles.calendarBlockFloating,
          dragActive && styles.calendarBlockDragging,
          { top, height, width, left, transform: [{ translateY }] },
          hidden && { opacity: 0 },
          Platform.OS === "web" ? { pointerEvents: hidden ? "none" : "auto" } : null,
        ]}
        pointerEvents={Platform.OS === "web" ? undefined : hidden ? "none" : "auto"}
      >
        <Pressable style={styles.calendarBlockContent} onPress={Platform.OS === "web" ? handlePress : () => onOpenTask(task)}>
          <Text style={styles.calendarBlockText}>{task.title}</Text>
          <Pressable
            onPress={(event) => {
              event.stopPropagation?.();
              onToggleTask(task);
            }}
          >
            <Ionicons
              name={task.status === "done" ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={task.status === "done" ? colors.primary : colors.textSecondary}
            />
          </Pressable>
        </Pressable>
        <View
          style={[styles.calendarResizeHandle, styles.calendarResizeHandleTop]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(event) => beginResize(event, task, metrics, "start")}
          onResponderMove={handleResizeMove}
          onResponderRelease={() => finishResize(true)}
          onResponderTerminate={() => finishResize(false)}
          onResponderTerminationRequest={() => false}
        />
        <View
          style={[styles.calendarResizeHandle, styles.calendarResizeHandleBottom]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(event) => beginResize(event, task, metrics, "end")}
          onResponderMove={handleResizeMove}
          onResponderRelease={() => finishResize(true)}
          onResponderTerminate={() => finishResize(false)}
          onResponderTerminationRequest={() => false}
        />
      </View>
    </GestureDetector>
  );
}

type DraggableDailyTaskCardProps = {
  task: LocalTask;
  onToggleStatus: (task: LocalTask) => Promise<void>;
  onOpenTask: (task: LocalTask) => void;
  badgeText?: string | null;
  detailText?: string | null;
  onDragStart: (task: LocalTask, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDragCancel: () => void;
};

function DraggableDailyTaskCard({
  task,
  onToggleStatus,
  onOpenTask,
  badgeText,
  detailText,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: DraggableDailyTaskCardProps) {
  const shouldSkipNextPressRef = useRef(false);

  const handlePress = useCallback(() => {
    if (shouldSkipNextPressRef.current) {
      shouldSkipNextPressRef.current = false;
      return;
    }
    onOpenTask(task);
  }, [onOpenTask, task]);

  const gesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(6)
      .onStart((event) => {
        shouldSkipNextPressRef.current = true;
        onDragStart(task, event.absoluteX, event.absoluteY);
      })
      .onUpdate((event) => {
        onDragMove(event.absoluteX, event.absoluteY);
      })
      .onEnd((event) => {
        onDragEnd(event.absoluteX, event.absoluteY);
      })
      .onFinalize(() => {
        const resetSkip = () => {
          shouldSkipNextPressRef.current = false;
        };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(resetSkip);
        } else {
          setTimeout(resetSkip, 0);
        }
        onDragCancel();
      })
      .runOnJS(true);
  }, [onDragCancel, onDragEnd, onDragMove, onDragStart, task]);

  return (
    <GestureDetector gesture={gesture}>
      <TaskCard task={task} onToggleStatus={onToggleStatus} onPress={handlePress} badgeText={badgeText} detailText={detailText} />
    </GestureDetector>
  );
}
