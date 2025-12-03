import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, type GestureResponderEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTheme } from "../../../theme/ThemeContext";
import type { LocalTask } from "../../../data/local/db";
import { usePlannerStyles } from "../state/PlannerStylesContext";
import type { PlannerDay } from "../types";
import { formatHourLabel, HOURS, HOUR_BLOCK_HEIGHT, CALENDAR_DAY_WIDTH } from "../utils/time";
import { getTaskTimeMetrics } from "../utils/taskTime";
import { resolvePlannerDropTarget, type PlannerDropTarget, type PlannerListHoverTarget } from "./drag/dropTargets";
import type { PlannerDragPreview } from "../types";

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
    // Drop finished tasks
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= task.start) {
        active.splice(i, 1);
      }
    }

    // Find smallest free column
    const used = new Set(active.map((a) => a.column));
    let column = 0;
    while (used.has(column)) column += 1;

    active.push({ id: task.id, end: task.end, column });

    const currentCols = Math.max(column + 1, active.length);
    // Every active task in this window should share the same column count
    active.forEach((item) => {
      layout[item.id] = { column: item.column, columns: currentCols };
    });
  });

  return layout;
}

type AssignToDayFn = (task: LocalTask, dayKey: string, startMinutes?: number, endMinutes?: number) => void | Promise<void>;

type PlannerWeekCalendarGridProps = {
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
  onResizeTask: (task: LocalTask, dayKey: string, startMinutes: number, endMinutes: number) => void | Promise<void>;
  onDragPreviewChange?: (preview: PlannerDragPreview | null) => void;
  onDayHoverChange?: (dayKey: string | null) => void;
  onListHoverChange?: (target: PlannerListHoverTarget | null) => void;
  onDropTaskOnDay?: AssignToDayFn;
  onDropTaskOnList?: (
    task: LocalTask,
    listId: string,
    targetTaskId?: string | null,
    position?: "before" | "after",
  ) => void | Promise<void>;
  externalPreview?: { task: LocalTask; dayKey: string; startMinutes: number } | null;
};

export function PlannerWeekCalendarGrid({
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
  onResizeTask,
  onDragPreviewChange,
  onDayHoverChange,
  onListHoverChange,
  onDropTaskOnDay,
  onDropTaskOnList,
  externalPreview,
}: PlannerWeekCalendarGridProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const hoverTargetRef = useRef<PlannerDropTarget | null>(null);
  const internalDragRef = useRef(false);

  const updateExternalHover = useCallback(
    (target: PlannerDropTarget | null, coords?: { x: number; y: number }, task?: LocalTask) => {
      const isInternalDrag = internalDragRef.current;
      const dropTarget = target;
      hoverTargetRef.current = dropTarget;

      if (!dropTarget) {
        onDayHoverChange?.(null);
        onListHoverChange?.(null);
        if (!isInternalDrag && coords && task) {
          onDragPreviewChange?.({ task, x: coords.x, y: coords.y, variant: "backlog" });
        } else {
          onDragPreviewChange?.(null);
        }
        return;
      }

      if (dropTarget.type === "calendarSlot" && task) {
        onDayHoverChange?.(dropTarget.dayKey);
        onListHoverChange?.(null);
        if (!isInternalDrag) {
          onDragPreviewChange?.(null);
        }
        return;
      }

      if (dropTarget.type === "day") {
        onDayHoverChange?.(dropTarget.dayKey);
        onListHoverChange?.(null);
        if (!isInternalDrag && coords && task) {
          onDragPreviewChange?.({ task, x: coords.x, y: coords.y, variant: "backlog" });
        }
        return;
      }

      onDayHoverChange?.(null);
      onListHoverChange?.(
        dropTarget.type === "list"
          ? dropTarget
          : { type: "task", listId: dropTarget.listId, taskId: dropTarget.taskId, position: dropTarget.position },
      );
      if (!isInternalDrag && coords && task) {
        onDragPreviewChange?.({ task, x: coords.x, y: coords.y, variant: "backlog" });
      }
    },
    [onDayHoverChange, onDragPreviewChange, onListHoverChange],
  );
  const dayIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    days.forEach((day, index) => {
      map[day.key] = index;
    });
    return map;
  }, [days]);

  const beginResize = useCallback(
    (event: GestureResponderEvent, task: LocalTask, dayKey: string, metrics: TaskMetrics, edge: ResizeEdge) => {
      if (Platform.OS !== "web") return;
      event.stopPropagation();
      event.preventDefault?.();
      const extent = metrics.startMinutes + metrics.durationMinutes;
      const originY = event.nativeEvent.pageY ?? event.nativeEvent.clientY ?? 0;
      setResizeState({
        task,
        dayKey,
        edge,
        startMinutes: metrics.startMinutes,
        endMinutes: extent,
        currentStart: metrics.startMinutes,
        currentEnd: extent,
        originY,
      });
    },
    [],
  );

  const beginDrag = useCallback(
    (task: LocalTask, dayKey: string, metrics: TaskMetrics, originX: number, originY: number) => {
      const dayIndex = dayIndexMap[dayKey];
      if (dayIndex === undefined) return;
      internalDragRef.current = true;
      if (Platform.OS === "web") {
        const hoverTarget = resolvePlannerDropTarget(originX, originY, task.id);
        updateExternalHover(hoverTarget, { x: originX, y: originY }, task);
      }
      setDragState({
        task,
        originDayKey: dayKey,
        dayIndex,
        currentDayIndex: dayIndex,
        currentDayKey: dayKey,
        startMinutes: metrics.startMinutes,
        durationMinutes: metrics.durationMinutes,
        currentStart: metrics.startMinutes,
        originX,
        originY,
        dragging: false,
      });
    },
    [dayIndexMap, updateExternalHover],
  );

  const commitDrag = useCallback(
    async (payload: { task: LocalTask; dayKey: string; start: number; end: number }) => {
      try {
        await onResizeTask(payload.task, payload.dayKey, payload.start, payload.end);
      } finally {
        setDragState(null);
      }
    },
    [onResizeTask],
  );

  const handleDragMove = useCallback(
    (task: LocalTask, absoluteX: number, absoluteY: number) => {
      setDragState((prev) => {
        if (!prev || prev.pendingCommit) return prev;
        const deltaY = absoluteY - prev.originY;
        const deltaMinutes = Math.round(((deltaY / HOUR_BLOCK_HEIGHT) * 60) / 15) * 15;
        const duration = prev.durationMinutes;
        let nextStart = clampMinutes(prev.startMinutes + deltaMinutes, 0, 24 * 60 - duration);
        const deltaX = absoluteX - prev.originX;
        const dayOffset = Math.round(deltaX / CALENDAR_DAY_WIDTH);
        let nextDayIndex = clampIndex(prev.dayIndex + dayOffset, days.length);
        const dragging =
          prev.dragging || Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6;
        if (
          nextStart === prev.currentStart &&
          nextDayIndex === prev.currentDayIndex &&
          dragging === prev.dragging
        ) {
          return prev;
        }
        return {
          ...prev,
          currentStart: nextStart,
          currentDayIndex: nextDayIndex,
          currentDayKey: days[nextDayIndex]?.key ?? prev.currentDayKey,
          dragging,
        };
      });
      if (Platform.OS === "web") {
        const hoverTarget = resolvePlannerDropTarget(absoluteX, absoluteY, task.id);
        updateExternalHover(hoverTarget, { x: absoluteX, y: absoluteY }, task);
      }
    },
    [days, updateExternalHover],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      onDragPreviewChange?.(null);
      onDayHoverChange?.(null);
      onListHoverChange?.(null);
      internalDragRef.current = false;
      setDragState((prev) => {
        if (!prev) return null;
        const hoverTarget = hoverTargetRef.current;
        hoverTargetRef.current = null;
        if (commit && hoverTarget) {
          if (hoverTarget.type === "calendarSlot" && onDropTaskOnDay) {
            const start = hoverTarget.hour * 60;
            const end = start + prev.durationMinutes;
            onDropTaskOnDay(prev.task, hoverTarget.dayKey, start, end);
            return null;
          }
          if (hoverTarget.type === "day" && onDropTaskOnDay) {
            onDropTaskOnDay(prev.task, hoverTarget.dayKey);
            return null;
          }
          if (hoverTarget.type !== "day" && hoverTarget.type !== "calendarSlot" && onDropTaskOnList) {
            const targetTaskId = hoverTarget.type === "task" ? hoverTarget.taskId : null;
            const position = hoverTarget.type === "task" ? hoverTarget.position : undefined;
            onDropTaskOnList(prev.task, hoverTarget.listId, targetTaskId, position);
            return null;
          }
        }
        if (!commit) return null;
        if (!prev.dragging && !prev.pendingCommit) {
          onOpenTask(prev.task);
          return null;
        }
        if (prev.pendingCommit) {
          return prev;
        }
        const start = prev.currentStart;
        const end = start + prev.durationMinutes;
        const targetDayKey = prev.currentDayKey;
        commitDrag({ task: prev.task, dayKey: targetDayKey, start, end });
        return { ...prev, pendingCommit: true };
      });
    },
    [commitDrag, onDayHoverChange, onDragPreviewChange, onDropTaskOnDay, onListHoverChange, onOpenTask, onDropTaskOnList],
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
              style={[styles.calendarHeaderCell, day.key === selectedDayKey && styles.calendarHeaderCellSelected]}
              onPress={() => onSelectDay(day.key)}
            >
              <Text style={styles.calendarHeaderDay}>{day.weekday}</Text>
              <Text style={styles.calendarHeaderDate}>{`${day.monthText} ${day.dayNumber}`}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          style={[styles.calendarGridScroll, { height: gridHeight }]}
          contentContainerStyle={styles.calendarGridBody}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.calendarHoursColumn}>
            {HOURS.map((hour, index) => (
              <View key={hour} style={[styles.calendarHourRow, index === HOURS.length - 1 && styles.calendarHourRowLast]}>
                <Text style={styles.calendarHourText}>{formatHourLabel(hour)}</Text>
              </View>
            ))}
          </View>
          {days.map((day) => {
            const dayTasks = (tasksByDay[day.key] ?? []).filter((task) => Boolean(task.planned_start));
            return (
              <View
                key={day.key}
                style={styles.calendarDayColumn}
                dataSet={{ dragTarget: "calendarDay", dayKey: day.key }}
                collapsable={false}
              >
                <View style={styles.calendarDaySlots}>
                  {HOURS.map((hour, index) => (
                    <Pressable
                      key={`${day.key}-${hour}`}
                      style={[
                        styles.calendarDaySlot,
                        day.key === selectedDayKey && styles.calendarDaySlotSelected,
                        index === HOURS.length - 1 && styles.calendarDaySlotLast,
                      ]}
                      dataSet={{ dragTarget: "calendarSlot", dayKey: day.key, hour: String(hour) }}
                      onPress={() => (pendingTask ? onDropPendingIntoSlot(day.key, hour) : undefined)}
                    />
                  ))}
                  {dragState && dragState.originDayKey !== day.key && dragState.currentDayKey === day.key ? (
                    <View
                      style={[
                        styles.calendarBlock,
                        styles.calendarBlockFloating,
                        styles.calendarBlockDragging,
                        {
                          top: (dragState.currentStart / 60) * HOUR_BLOCK_HEIGHT,
                          height: Math.max(28, (dragState.durationMinutes / 60) * HOUR_BLOCK_HEIGHT),
                        },
                        Platform.OS === "web" ? { pointerEvents: "none" } : null,
                      ]}
                      pointerEvents={Platform.OS === "web" ? undefined : "none"}
                    >
                      <View style={styles.calendarBlockContent}>
                        <Text style={styles.calendarBlockText}>{dragState.task.title}</Text>
                        <Ionicons
                          name={dragState.task.status === "done" ? "checkmark-circle" : "ellipse-outline"}
                          size={14}
                          color={dragState.task.status === "done" ? colors.successAlt : colors.textSecondary}
                        />
                      </View>
                    </View>
                  ) : null}
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
                </View>
                <View
                  style={[
                    styles.calendarDayTasks,
                    { height: HOURS.length * HOUR_BLOCK_HEIGHT },
                    Platform.OS === "web" ? { pointerEvents: "box-none" } : null,
                  ]}
                  pointerEvents={Platform.OS === "web" ? undefined : "box-none"}
                  dataSet={{ dragTarget: "calendarDay", dayKey: day.key }}
                  collapsable={false}
                >
                  {(() => {
                    const taskPositions: PositionedTask[] = dayTasks.map((task) => {
                      const metrics = getTaskTimeMetrics(task);
                      if (!metrics) return { id: task.id, start: 0, end: 0, hidden: true };
                      const isDraggedTask = dragState?.task.id === task.id;
                      const hidden = isDraggedTask && dragState.currentDayKey !== day.key;
                      const isResizing =
                        resizeState?.task.id === task.id && resizeState.dayKey === day.key && resizeState.edge !== undefined;
                      const startMinutes = isResizing ? resizeState.currentStart : metrics.startMinutes;
                      const endMinutes = isResizing
                        ? resizeState.currentEnd
                        : metrics.startMinutes + metrics.durationMinutes;
                      return { id: task.id, start: startMinutes, end: endMinutes, hidden };
                    });
                    const layoutMap = computeOverlapLayout(taskPositions);
                    return dayTasks.map((task) => {
                      const metrics = getTaskTimeMetrics(task);
                      if (!metrics) return null;
                      const isDraggedTask = dragState?.task.id === task.id;
                      const hidden = isDraggedTask && dragState.currentDayKey !== day.key;
                      const isResizing =
                      resizeState?.task.id === task.id && resizeState.dayKey === day.key && resizeState.edge !== undefined;
                    const startMinutes = isResizing ? resizeState.currentStart : metrics.startMinutes;
                    const endMinutes = isResizing
                      ? resizeState.currentEnd
                      : metrics.startMinutes + metrics.durationMinutes;
                    const adjustedDuration = Math.max(15, endMinutes - startMinutes);
                    const top = (startMinutes / 60) * HOUR_BLOCK_HEIGHT;
                    const height = Math.max(28, (adjustedDuration / 60) * HOUR_BLOCK_HEIGHT);
                    const dragActive = isDraggedTask && dragState.currentDayKey === day.key;
                    const resizingActive =
                      resizeState?.task.id === task.id && resizeState.dayKey === day.key && resizeState.edge !== undefined;
                    const translateY = dragActive
                      ? ((dragState.currentStart - metrics.startMinutes) / 60) * HOUR_BLOCK_HEIGHT
                      : 0;
                    const translateX = dragActive
                      ? (dragState.currentDayIndex - (dayIndexMap[day.key] ?? 0)) * CALENDAR_DAY_WIDTH
                      : 0;
                    const layout = layoutMap[task.id] ?? { column: 0, columns: 1 };
                    const gutter = 4;
                    const columnWidth = CALENDAR_DAY_WIDTH / layout.columns;
                    const width = Math.max(40, columnWidth - gutter);
                    const left = layout.column * columnWidth + gutter / 2;
                      return (
                        <CalendarGridTask
                          key={task.id}
                          task={task}
                          dayKey={day.key}
                        metrics={metrics}
                        top={top}
                        height={height}
                        translateX={translateX}
                        translateY={translateY}
                        dragActive={dragActive}
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
                          isDragging={Boolean(dragState?.task.id === task.id && dragState.dragging)}
                          isResizing={Boolean(resizingActive)}
                          hidden={hidden}
                          width={width}
                          left={left}
                        />
                      );
                    });
                  })()}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
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
  originDayKey: string;
  dayIndex: number;
  currentDayIndex: number;
  currentDayKey: string;
  startMinutes: number;
  durationMinutes: number;
  currentStart: number;
  originX: number;
  originY: number;
  dragging: boolean;
  pendingCommit?: boolean;
};

function clampMinutes(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampIndex(value: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, value));
}

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

type CalendarGridTaskProps = {
  task: LocalTask;
  dayKey: string;
  metrics: TaskMetrics;
  top: number;
  height: number;
  width: number;
  left: number;
  translateX: number;
  translateY: number;
  dragActive: boolean;
  styles: ReturnType<typeof usePlannerStyles>;
  colors: ReturnType<typeof useTheme>["colors"];
  onOpenTask: (task: LocalTask) => void;
  onToggleTask: (task: LocalTask) => Promise<void>;
  beginDrag: (task: LocalTask, dayKey: string, metrics: TaskMetrics, originX: number, originY: number) => void;
  handleDragMove: (task: LocalTask, x: number, y: number) => void;
  finishDrag: (commit: boolean) => void;
  beginResize: (event: GestureResponderEvent, task: LocalTask, dayKey: string, metrics: TaskMetrics, edge: ResizeEdge) => void;
  handleResizeMove: (event: GestureResponderEvent) => void;
  finishResize: (commit: boolean) => void;
  isDragging: boolean;
  isResizing: boolean;
  hidden: boolean;
};

function CalendarGridTask({
  task,
  dayKey,
  metrics,
  top,
  height,
  width,
  left,
  translateX,
  translateY,
  dragActive,
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
  isDragging,
  isResizing,
  hidden,
}: CalendarGridTaskProps) {
  const shouldSkipNextPressRef = useRef(false);
  const dragGesture = useMemo(() => {
    let ended = false;
    return Gesture.Pan()
      .minDistance(6)
      .onStart((event) => {
        ended = false;
        shouldSkipNextPressRef.current = true;
        beginDrag(task, dayKey, metrics, event.absoluteX, event.absoluteY);
      })
      .onUpdate((event) => {
        handleDragMove(task, event.absoluteX, event.absoluteY);
      })
      .onEnd(() => {
        ended = true;
        finishDrag(true);
      })
      .onFinalize(() => {
        if (!ended) {
          finishDrag(false);
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
  }, [beginDrag, dayKey, finishDrag, handleDragMove, isResizing, metrics, task]);

  const handlePress = useCallback(() => {
    if (shouldSkipNextPressRef.current || isDragging) {
      shouldSkipNextPressRef.current = false;
      return;
    }
    onOpenTask(task);
  }, [isDragging, onOpenTask, task]);

  const handleToggle = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation?.();
      if (shouldSkipNextPressRef.current || isDragging) {
        return;
      }
      onToggleTask(task);
    },
    [isDragging, onToggleTask, task],
  );

  return (
    <GestureDetector gesture={dragGesture}>
      <View
        style={[
          styles.calendarBlock,
          styles.calendarBlockFloating,
          dragActive && styles.calendarBlockDragging,
          { top, height, width, left, transform: [{ translateX }, { translateY }] },
          hidden && { opacity: 0 },
          Platform.OS === "web" ? { pointerEvents: hidden ? "none" : "auto" } : null,
        ]}
        pointerEvents={Platform.OS === "web" ? undefined : hidden ? "none" : "auto"}
      >
        <Pressable style={styles.calendarBlockContent} onPress={handlePress}>
          <Text style={styles.calendarBlockText}>{task.title}</Text>
          <Pressable onPress={handleToggle}>
            <Ionicons
              name={task.status === "done" ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={task.status === "done" ? colors.successAlt : colors.textSecondary}
            />
          </Pressable>
        </Pressable>
        <View
          style={[styles.calendarResizeHandle, styles.calendarResizeHandleTop]}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) => beginResize(event, task, dayKey, metrics, "start")}
          onResponderMove={handleResizeMove}
          onResponderRelease={() => finishResize(true)}
          onResponderTerminate={() => finishResize(false)}
          onResponderTerminationRequest={() => false}
        />
        <View
          style={[styles.calendarResizeHandle, styles.calendarResizeHandleBottom]}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) => beginResize(event, task, dayKey, metrics, "end")}
          onResponderMove={handleResizeMove}
          onResponderRelease={() => finishResize(true)}
          onResponderTerminate={() => finishResize(false)}
          onResponderTerminationRequest={() => false}
        />
      </View>
    </GestureDetector>
  );
}
