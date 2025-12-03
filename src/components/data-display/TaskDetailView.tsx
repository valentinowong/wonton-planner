import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { LocalTask } from "../../data/local/db";
import { supabase } from "../../data/remote/client";
import {
  fetchRecurrence,
  setRecurrenceActive,
  upsertRecurrence,
  upsertRecurrenceOccurrence,
  upsertTaskRow,
  type RecurrenceRow,
} from "../../data/remote/tasksApi";
import type { TaskWindowRow } from "../../data/sync";
import { queueTaskMutation } from "../../data/sync";
import { generateUUID } from "../../domain/shared/uuid";
import { useLists } from "../../features/planner/hooks/useLists";
import { useSubtasks } from "../../features/planner/hooks/useSubtasks";
import type { ThemeColors } from "../../theme";
import { useTheme } from "../../theme/ThemeContext";
import { AddTaskInput } from "../ui/AddTaskInput";
import { PlatformDateTimePicker } from "../ui/PlatformDateTimePicker";
import { SubtaskItem } from "./SubtaskItem";

async function fetchTask(taskId: string) {
  const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (error) throw error;
  return data as LocalTask;
}

type Props = {
  taskId: string;
  initialTask?: Partial<LocalTask | TaskWindowRow>;
  scrollStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onDirtyChange?: (dirty: boolean) => void;
};

type SectionKey = "title" | "notes" | "list" | "schedule" | "subtasks";

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatTimeInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseTimeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function combineDateAndTime(dateKey: string, hours: number, minutes: number) {
  const base = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(hours, minutes, 0, 0);
  return base;
}

function formatScheduleSummary(task?: Pick<LocalTask, "due_date" | "planned_start" | "planned_end"> | null) {
  if (!task?.due_date) return "Not scheduled";
  const dateLabel = new Date(`${task.due_date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!task.planned_start) {
    return dateLabel;
  }
  const start = new Date(task.planned_start);
  const end = task.planned_end ? new Date(task.planned_end) : null;
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const startLabel = timeFormatter.format(start);
  const endLabel = end ? timeFormatter.format(end) : null;
  return `${dateLabel} · ${startLabel}${endLabel ? ` – ${endLabel}` : ""}`;
}

function formatDateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map((v) => Number(v));
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDateLabel(value: string) {
  const parsed = parseDateKey(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeLabel(value: string) {
  const parsed = parseTimeInput(value);
  if (!parsed) return value;
  const reference = new Date();
  reference.setHours(parsed.hours, parsed.minutes, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(reference);
}

function weekdayLabels() {
  return [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];
}

type PickerType = "date" | "start" | "end" | "until";

type Styles = ReturnType<typeof createStyles>;

export type TaskDetailViewHandle = {
  savePendingFields: () => Promise<void>;
};

export const TaskDetailView = forwardRef<TaskDetailViewHandle, Props>(function TaskDetailView(
  { taskId, initialTask, scrollStyle, contentStyle, onDirtyChange }: Props,
  ref,
) {
  const queryClient = useQueryClient();
  const { data: listsData } = useLists();
  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask(taskId),
    enabled: Boolean(taskId && !(initialTask as TaskWindowRow | LocalTask | undefined)?.is_recurring),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    staleTime: Infinity,
  });
  const baseTask = (taskQuery.data ?? initialTask ?? null) as (LocalTask & {
    is_recurring?: boolean;
    recurrence_id?: string | null;
    occurrence_date?: string | null;
  }) | null;
  const isRecurring = Boolean(baseTask?.is_recurring);
  const recurrenceId = baseTask?.recurrence_id ?? null;
  const occurrenceDate = baseTask?.occurrence_date ?? null;
  const recurrenceQuery = useQuery({
    queryKey: ["recurrence", recurrenceId],
    queryFn: () => fetchRecurrence(recurrenceId ?? ""),
    enabled: Boolean(recurrenceId),
  });
  const { data: subtasks, upsertSubtask } = useSubtasks(taskId);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [activePicker, setActivePicker] = useState<PickerType | null>(null);
  const [pendingPickerValue, setPendingPickerValue] = useState<Date | null>(null);
  const [listAssignment, setListAssignment] = useState<string | null>(null);
  const [recurringDays, setRecurringDays] = useState<Set<number>>(new Set());
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [repeatMode, setRepeatMode] = useState<"none" | "daily" | "weekly" | "monthly" | "yearly">("none");
  const [monthlyDay, setMonthlyDay] = useState<number | null>(null);
  const [dailyInterval, setDailyInterval] = useState(1);
  const [status, setStatus] = useState<LocalTask["status"]>("todo");
  const [isEditing, setIsEditing] = useState(false);
  const [hasPendingEdits, setHasPendingEdits] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    title: false,
    notes: false,
    list: false,
    schedule: false,
    subtasks: false,
  });
  const [repeatModalOpen, setRepeatModalOpen] = useState(false);
  const recurrencePromptResolver = useRef<(() => void) | null>(null);
  const [recurrencePrompt, setRecurrencePrompt] = useState<Partial<LocalTask> | null>(null);

  const markDirty = (next: boolean) => {
    setHasPendingEdits(next);
    onDirtyChange?.(next);
  };

  const buildTimeRangeForDate = (dateKey: string) => {
    const startParsed = parseTimeInput(startTimeInput);
    const endParsed = parseTimeInput(endTimeInput);
    if (!startParsed) return { start: null, end: null };
    const start = combineDateAndTime(dateKey, startParsed.hours, startParsed.minutes);
    let end = endParsed ? combineDateAndTime(dateKey, endParsed.hours, endParsed.minutes) : null;
    if (!end && start) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    return {
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
    };
  };

  const generateUpcomingRecurrenceDates = (startKey: string, maxDays = 60): string[] => {
    const dates: string[] = [];
    const startDate = parseDateKey(startKey);
    if (!startDate) return dates;
    const weekdaySet = recurringDays.size ? recurringDays : new Set([startDate.getDay()]);
    for (let i = 0; i <= maxDays; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = formatDateKeyFromDate(d);
      if (repeatMode === "daily") {
        if (i % dailyInterval === 0) dates.push(key);
      } else if (repeatMode === "weekly") {
        if (weekdaySet.has(d.getDay())) dates.push(key);
      } else if (repeatMode === "monthly") {
        if (d.getDate() === (monthlyDay ?? startDate.getDate())) dates.push(key);
      } else if (repeatMode === "yearly") {
        if (d.getMonth() === startDate.getMonth() && d.getDate() === startDate.getDate()) dates.push(key);
      }
    }
    return dates;
  };

  const getListId = () => listAssignment ?? baseTask?.list_id ?? orderedLists[0]?.id ?? null;

  function resolveScheduleFromInputs(): { due_date: string | null; planned_start: string | null; planned_end: string | null } | null {
    if (!dateInput) {
      return { due_date: null, planned_start: null, planned_end: null };
    }
    const startParsed = parseTimeInput(startTimeInput);
    const endParsed = parseTimeInput(endTimeInput);
    const startDate = startParsed ? combineDateAndTime(dateInput, startParsed.hours, startParsed.minutes) : null;
    const endDate = endParsed ? combineDateAndTime(dateInput, endParsed.hours, endParsed.minutes) : null;
    if (endDate && startDate && endDate.getTime() <= startDate.getTime()) {
      Alert.alert("Invalid time range", "End time must be later than the start time.");
      return null;
    }
    return {
      due_date: dateInput,
      planned_start: startDate ? startDate.toISOString() : null,
      planned_end: endDate ? endDate.toISOString() : null,
    };
  }

  function buildChangeSet() {
    if (!baseTask) return null;
    const nextTitle = title.trim();
    if (!nextTitle) {
      Alert.alert("Title required", "Add a title before saving.");
      return null;
    }
    const schedule = resolveScheduleFromInputs();
    if (!schedule) return null;
    const nextListId = getListId();
    const changes: Partial<LocalTask> = {};
    if (nextTitle !== baseTask.title) changes.title = nextTitle;
    if ((notes || null) !== (baseTask.notes ?? null)) changes.notes = notes || null;
    if (nextListId !== (baseTask.list_id ?? null)) changes.list_id = nextListId;
    if ((status ?? "todo") !== (baseTask.status ?? "todo")) changes.status = status ?? "todo";
    if ((schedule.due_date ?? null) !== (baseTask.due_date ?? null)) changes.due_date = schedule.due_date ?? null;
    if ((schedule.planned_start ?? null) !== (baseTask.planned_start ?? null)) changes.planned_start = schedule.planned_start ?? null;
    if ((schedule.planned_end ?? null) !== (baseTask.planned_end ?? null)) changes.planned_end = schedule.planned_end ?? null;
    return changes;
  }

  const [lastLoadedTaskId, setLastLoadedTaskId] = useState<string | null>(null);
  const patchLocalTaskCache = (changes: Partial<LocalTask>) => {
    if (!baseTask) return;
    const merged = { ...baseTask, ...changes };
    queryClient.setQueryData(["task", taskId], merged);
    queryClient.setQueriesData<TaskWindowRow[]>({ queryKey: ["tasks"] }, (current) =>
      current ? current.map((row) => (row.id === taskId ? { ...row, ...changes } : row)) : current,
    );
  };

  useEffect(() => {
    if (isEditing || hasPendingEdits) return;
    if (baseTask && baseTask.id !== lastLoadedTaskId) {
      setLastLoadedTaskId(baseTask.id);
      setTitle(baseTask.title);
      setNotes(baseTask.notes ?? "");
      setDateInput(baseTask.due_date ?? "");
      setStartTimeInput(formatTimeInputValue(baseTask.planned_start));
      setEndTimeInput(formatTimeInputValue(baseTask.planned_end));
      setListAssignment(baseTask.list_id ?? null);
      setStatus(baseTask.status ?? "todo");
    }
  }, [baseTask, lastLoadedTaskId, isEditing, hasPendingEdits]);

  const saveMutation = useMutation({
    mutationFn: async (changes: Partial<LocalTask>) => {
      const source = taskQuery.data ?? (initialTask as LocalTask | undefined) ?? baseTask ?? undefined;
      if (!source) return;
      await queueTaskMutation({ ...source, ...changes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
    },
  });

  async function applyChangesToRecurrence(changes: Partial<LocalTask>) {
    if (!recurrenceId) return;
    const source: Partial<RecurrenceRow> = recurrenceQuery.data ?? {
      start_date: dateInput || occurrenceDate || new Date().toISOString().split("T")[0],
      title,
      notes,
      list_id: listAssignment,
      estimate_minutes: baseTask?.estimate_minutes ?? null,
      priority: baseTask?.priority ?? null,
    };
    const daySeed = recurringDays.size
      ? Array.from(recurringDays).sort()
      : [(() => {
          const parsed = source.start_date ? parseDateKey(source.start_date) : null;
          return parsed ? parsed.getDay() : new Date().getDay();
        })()];
    const startDateKey = (changes.due_date as string | null | undefined) ?? source.start_date ?? dateInput ?? occurrenceDate ?? new Date().toISOString().split("T")[0];
    const payload: Partial<RecurrenceRow> & { start_date: string; freq: RecurrenceRow["freq"] } = {
      id: recurrenceId,
      title: "title" in changes ? (changes.title as string | undefined) ?? "" : source.title ?? "",
      notes: "notes" in changes ? (changes.notes as string | null | undefined) ?? null : source.notes ?? null,
      list_id: "list_id" in changes ? (changes.list_id as string | null | undefined) ?? null : source.list_id ?? null,
      estimate_minutes:
        "estimate_minutes" in changes ? changes.estimate_minutes ?? null : source.estimate_minutes ?? null,
      priority: "priority" in changes ? changes.priority ?? null : source.priority ?? null,
      byday: daySeed,
      until: recurrenceUntil || null,
      interval: 1,
      start_date: startDateKey,
      freq: "WEEKLY",
      active: true,
    };
    const result = await upsertRecurrence(payload);
    // Also update the template task so defaults match the series edits.
    const templateId = recurrenceQuery.data?.template_task_id;
    if (templateId) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      const taskPatch: Record<string, unknown> = {
        id: templateId,
        title: (changes.title as string | undefined) ?? baseTask?.title ?? recurrenceQuery.data?.title ?? "Untitled task",
        status: (changes.status as LocalTask["status"] | undefined) ?? baseTask?.status ?? "todo",
      };
      if (userId) taskPatch.user_id = userId;
      if ("title" in changes) taskPatch.title = changes.title;
      if ("notes" in changes) taskPatch.notes = changes.notes ?? null;
      if ("list_id" in changes) taskPatch.list_id = changes.list_id ?? null;
      if ("planned_start" in changes) taskPatch.planned_start = changes.planned_start ?? null;
      if ("planned_end" in changes) taskPatch.planned_end = changes.planned_end ?? null;
      if ("estimate_minutes" in changes) taskPatch.estimate_minutes = changes.estimate_minutes ?? null;
      if ("priority" in changes) taskPatch.priority = changes.priority ?? null;
      if ("due_date" in changes) {
        // Keep template's due_date in sync with start_date if user moved the series start.
        taskPatch.due_date = changes.due_date ?? payload.start_date;
      } else if (baseTask?.due_date) {
        taskPatch.due_date = baseTask.due_date;
      }
      // Only send if there is something besides the id.
      if (Object.keys(taskPatch).length > 1) {
        await upsertTaskRow(taskPatch);
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["recurrence", recurrenceId] });
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function applyChangesToOccurrence(changes: Partial<LocalTask>) {
    if (!recurrenceId || !occurrenceDate) return;
    const occurrencePatch: {
      recurrence_id: string;
      occurrence_date: string;
      status?: LocalTask["status"];
      title?: string | null;
      notes?: string | null;
      list_id?: string | null;
      planned_start?: string | null;
      planned_end?: string | null;
      actual_minutes?: number | null;
      moved_to_date?: string | null;
    } = {
      recurrence_id: recurrenceId,
      occurrence_date: occurrenceDate,
    };

    if ("status" in changes) occurrencePatch.status = changes.status;
    if ("title" in changes) occurrencePatch.title = (changes.title as string | undefined) ?? null;
    if ("notes" in changes) occurrencePatch.notes = (changes.notes as string | null | undefined) ?? null;
    if ("list_id" in changes) occurrencePatch.list_id = (changes.list_id as string | null | undefined) ?? null;
    if ("planned_start" in changes) occurrencePatch.planned_start = changes.planned_start ?? null;
    if ("planned_end" in changes) occurrencePatch.planned_end = changes.planned_end ?? null;
    if ("actual_minutes" in changes) occurrencePatch.actual_minutes = changes.actual_minutes ?? null;
    if ("due_date" in changes) occurrencePatch.moved_to_date = changes.due_date ?? null;
    if ("moved_to_date" in changes) occurrencePatch.moved_to_date = changes.moved_to_date ?? null;

    // Only write if something besides the keys is present
    if (Object.keys(occurrencePatch).length > 2) {
      await upsertRecurrenceOccurrence(occurrencePatch);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  }

  async function saveChangesWithScope(changes: Partial<LocalTask>) {
    if (!baseTask || !Object.keys(changes).length) return;
    if (!isRecurring) {
      await saveMutation.mutateAsync(changes);
      patchLocalTaskCache(changes);
      return;
    }
    await new Promise<void>((resolve) => {
      recurrencePromptResolver.current = resolve;
      setRecurrencePrompt(changes);
    });
  }

  async function handleRecurrenceDecision(scope: "occurrence" | "series" | "cancel") {
    const pending = recurrencePrompt;
    setRecurrencePrompt(null);
    const finalize = () => {
      recurrencePromptResolver.current?.();
      recurrencePromptResolver.current = null;
    };
    if (!pending || scope === "cancel") {
      finalize();
      return;
    }
    try {
      if (scope === "series") {
        await applyChangesToRecurrence(pending);
      } else {
        await applyChangesToOccurrence(pending);
      }
      patchLocalTaskCache(pending);
    } finally {
      finalize();
    }
  }

  useImperativeHandle(ref, () => ({
    savePendingFields: async () => {
      const changes = buildChangeSet();
      if (changes === null) return;
      if (!Object.keys(changes).length) {
        markDirty(false);
        return;
      }
      await saveChangesWithScope(changes);
      markDirty(false);
    },
  }));

  async function handleAddSubtask(value: string) {
    if (!taskId || !value.trim()) return;
    await upsertSubtask({
      id: generateUUID(),
      task_id: taskId,
      title: value.trim(),
      done: false,
      sort_index: (subtasks?.length ?? 0) + 1,
    });
  }

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const orderedLists = useMemo(() => {
    if (!listsData) return [];
    const inbox = listsData.find((list) => (list.name ?? "").toLowerCase() === "inbox");
    const rest = listsData.filter((list) => list.id !== inbox?.id);
    return inbox ? [inbox, ...rest] : rest;
  }, [listsData]);
  const currentListName = listAssignment
    ? orderedLists.find((list) => list.id === listAssignment)?.name ?? "Untitled"
    : "Not on a list";
  const scheduleSummary = useMemo(() => {
    if (!dateInput) return "Not scheduled";
    const startParsed = parseTimeInput(startTimeInput);
    const endParsed = parseTimeInput(endTimeInput);
    const preview: Pick<LocalTask, "due_date" | "planned_start" | "planned_end"> = {
      due_date: dateInput,
      planned_start: null,
      planned_end: null,
    };
    if (startParsed) {
      const startDate = combineDateAndTime(dateInput, startParsed.hours, startParsed.minutes);
      preview.planned_start = startDate ? startDate.toISOString() : null;
    }
    if (endParsed) {
      const endDate = combineDateAndTime(dateInput, endParsed.hours, endParsed.minutes);
      preview.planned_end = endDate ? endDate.toISOString() : null;
    }
    return formatScheduleSummary(preview);
  }, [dateInput, startTimeInput, endTimeInput]);
  const dateLabel = dateInput ? formatDateLabel(dateInput) : "Pick a date";
  const startLabel = startTimeInput ? formatTimeLabel(startTimeInput) : "Add start time";
  const endLabel = endTimeInput ? formatTimeLabel(endTimeInput) : "Add end time";

  useEffect(() => {
    if (recurrenceQuery.data) {
      setRecurringDays(new Set(recurrenceQuery.data.byday ?? []));
      setRecurrenceUntil(recurrenceQuery.data.until ?? "");
      const freq = recurrenceQuery.data.freq ?? "WEEKLY";
      if (freq === "DAILY") {
        setRepeatMode("daily");
        setDailyInterval(recurrenceQuery.data.interval ?? 1);
      } else if (freq === "WEEKLY") {
        setRepeatMode("weekly");
      } else if (freq === "MONTHLY" && (recurrenceQuery.data.by_monthday?.length ?? 0) > 0) {
        setRepeatMode("monthly");
        setMonthlyDay(recurrenceQuery.data.by_monthday?.[0] ?? null);
      } else if (freq === "MONTHLY" && (recurrenceQuery.data.interval ?? 1) >= 12) {
        setRepeatMode("yearly");
      } else {
        setRepeatMode("weekly");
      }
    } else if (baseTask?.due_date) {
      const baseDate = parseDateKey(baseTask.due_date);
      setRecurringDays((prev) => (prev.size || !baseDate ? prev : new Set([baseDate.getDay()])));
    }
  }, [recurrenceQuery.data, baseTask?.due_date]);

  useEffect(() => {
    if (dateInput) {
      const day = new Date(dateInput).getDate();
      setMonthlyDay((prev) => prev ?? day);
    }
  }, [dateInput]);

  function handleSelectList(listId: string) {
    if (listAssignment === listId) return;
    setListAssignment(listId);
    markDirty(true);
  }

  function openPicker(kind: PickerType) {
    if (kind !== "date" && kind !== "until" && !dateInput) {
      Alert.alert("Add a date first", "Set a date before picking a time.");
      return;
    }
    if (kind === "end" && !startTimeInput) {
      Alert.alert("Add a start time first", "Set a start time before the end time.");
      return;
    }
    const initial = getInitialPickerValue(kind);
    setPendingPickerValue(initial);
    setActivePicker(kind);
  }

  function closePicker() {
    setActivePicker(null);
    setPendingPickerValue(null);
  }

  function getInitialPickerValue(kind: PickerType) {
    if (kind === "date") {
      const parsed = dateInput ? parseDateKey(dateInput) : null;
      return parsed ?? new Date();
    }
    if (kind === "until") {
      const parsed = recurrenceUntil ? parseDateKey(recurrenceUntil) : null;
      return parsed ?? new Date();
    }
    const baseDate = dateInput ? parseDateKey(dateInput) : null;
    const target = kind === "start" ? startTimeInput : endTimeInput;
    const parsedTime = parseTimeInput(target);
    if (baseDate && parsedTime && dateInput) {
      const combined = combineDateAndTime(dateInput, parsedTime.hours, parsedTime.minutes);
      if (combined) return combined;
    }
    return baseDate ?? new Date();
  }

  function handlePickDate(next: Date) {
    const dateKey = formatDateKeyFromDate(next);
    setDateInput(dateKey);
    const startParsed = parseTimeInput(startTimeInput);
    const endParsed = parseTimeInput(endTimeInput);
    if (startParsed) {
      const startDate = combineDateAndTime(dateKey, startParsed.hours, startParsed.minutes);
      if (startDate) {
        setStartTimeInput(formatTimeInputValue(startDate.toISOString()));
        if (endParsed) {
          const endDate = combineDateAndTime(dateKey, endParsed.hours, endParsed.minutes);
          if (endDate) {
            setEndTimeInput(formatTimeInputValue(endDate.toISOString()));
          }
        } else if (taskQuery.data?.planned_end && taskQuery.data?.planned_start) {
          const duration =
            new Date(taskQuery.data.planned_end).getTime() - new Date(taskQuery.data.planned_start).getTime();
          if (duration > 0) {
            const carriedEnd = new Date(startDate.getTime() + duration);
            setEndTimeInput(formatTimeInputValue(carriedEnd.toISOString()));
          }
        }
      }
    } else {
      setStartTimeInput("");
      setEndTimeInput("");
    }
    markDirty(true);
  }

  function handlePickStartTime(next: Date) {
    const dateKey = dateInput || formatDateKeyFromDate(next);
    if (!dateKey) {
      Alert.alert("Add a date first", "Set a date before picking a time.");
      return;
    }
    setDateInput(dateKey);
    setStartTimeInput(formatTimeInputValue(next.toISOString()));
    const nextStart = combineDateAndTime(dateKey, next.getHours(), next.getMinutes());
    if (!nextStart) return;
    const prevStart = parseTimeInput(startTimeInput);
    const prevEnd = parseTimeInput(endTimeInput);
    let durationMinutes: number | null = null;
    if (prevStart && prevEnd) {
      durationMinutes =
        prevEnd.hours * 60 +
        prevEnd.minutes -
        (prevStart.hours * 60 + prevStart.minutes);
      if (durationMinutes <= 0) durationMinutes = null;
    }
    const endParsed = parseTimeInput(endTimeInput);
    let nextEnd: Date | null = null;
    if (endParsed) {
      const candidate = combineDateAndTime(dateKey, endParsed.hours, endParsed.minutes);
      if (candidate && candidate.getTime() > nextStart.getTime()) {
        nextEnd = candidate;
      }
    }
    if (!nextEnd && durationMinutes) {
      nextEnd = new Date(nextStart.getTime() + durationMinutes * 60 * 1000);
    }
    if (!nextEnd) {
      nextEnd = new Date(nextStart.getTime() + 60 * 60 * 1000);
    }
    setEndTimeInput(nextEnd ? formatTimeInputValue(nextEnd.toISOString()) : "");
    markDirty(true);
  }

  function handlePickEndTime(next: Date) {
    const dateKey = dateInput;
    if (!dateKey) {
      Alert.alert("Add a date first", "Set a date before picking a time.");
      return;
    }
    const startParsed = parseTimeInput(startTimeInput);
    if (!startParsed) {
      Alert.alert("Add a start time first", "Set a start time before the end time.");
      return;
    }
    const startDate = combineDateAndTime(dateKey, startParsed.hours, startParsed.minutes);
    const nextEnd = combineDateAndTime(dateKey, next.getHours(), next.getMinutes());
    if (!startDate || !nextEnd || nextEnd.getTime() <= startDate.getTime()) {
      Alert.alert("Invalid time range", "End time must be later than the start time.");
      return;
    }
    setEndTimeInput(formatTimeInputValue(nextEnd.toISOString()));
    markDirty(true);
  }

  function commitPendingPicker() {
    if (!activePicker || !pendingPickerValue) {
      closePicker();
      return;
    }
    if (activePicker === "date") {
      handlePickDate(pendingPickerValue);
    } else if (activePicker === "start") {
      handlePickStartTime(pendingPickerValue);
    } else if (activePicker === "end") {
      handlePickEndTime(pendingPickerValue);
    } else if (activePicker === "until") {
      handlePickUntil(pendingPickerValue);
    }
    closePicker();
  }

  function handlePickUntil(next: Date) {
    const dateKey = formatDateKeyFromDate(next);
    setRecurrenceUntil(dateKey);
  }

  function toggleRecurringDay(day: number) {
    setRecurringDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  function handleClearSchedule() {
    setDateInput("");
    setStartTimeInput("");
    setEndTimeInput("");
    closePicker();
    markDirty(true);
  }

  const toggleSection = (key: SectionKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const repeatOptions: Array<{ key: typeof repeatMode; label: string }> = [
    { key: "none", label: "None" },
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
  ];

  function handleSelectRepeatMode(mode: typeof repeatMode) {
    setRepeatMode(mode);
    const baseDateKey = dateInput || baseTask?.due_date || occurrenceDate || null;
    if (!isRecurring && baseDateKey) {
      if (mode === "weekly" && recurringDays.size === 0) {
        const parsed = parseDateKey(baseDateKey);
        if (parsed) setRecurringDays(new Set([parsed.getDay()]));
      }
      if (mode === "monthly") {
        const parsed = parseDateKey(baseDateKey);
        if (parsed) setMonthlyDay(parsed.getDate());
      }
    }
  }

  function openRepeatModal() {
    const baseDateKey = dateInput || baseTask?.due_date || occurrenceDate || null;
    if (!isRecurring && baseDateKey) {
      if (recurringDays.size === 0) {
        const parsed = parseDateKey(baseDateKey);
        if (parsed) setRecurringDays(new Set([parsed.getDay()]));
      }
      {
        const parsed = parseDateKey(baseDateKey);
        if (parsed) setMonthlyDay(parsed.getDate());
      }
    }
    if (repeatMode === "none") {
      setRepeatMode("weekly");
    }
    setRepeatModalOpen(true);
  }

  function renderRepeatSuboptions() {
    const dayFromDate = dateInput ? (parseDateKey(dateInput)?.getDate() ?? 1) : 1;
    if (repeatMode === "daily") {
      return (
        <View style={styles.repeatFieldRow}>
          <Text style={styles.scheduleFieldLabel}>Every</Text>
          <TextInput
            style={[styles.input, styles.inlineNumberInput]}
            keyboardType="number-pad"
            value={String(dailyInterval)}
            onChangeText={(value) => {
              const num = Math.max(1, Number.parseInt(value || "1", 10) || 1);
              setDailyInterval(num);
            }}
          />
          <Text style={styles.scheduleFieldLabel}>day(s)</Text>
        </View>
      );
    }
    if (repeatMode === "weekly") {
      // Default to the task's weekday if none selected yet.
      if (recurringDays.size === 0 && dateInput) {
        const parsed = parseDateKey(dateInput);
        if (parsed) setRecurringDays(new Set([parsed.getDay()]));
      }
      return (
        <>
          <View style={styles.weekdayRow}>
            {weekdayLabels().map((item) => {
              const active = recurringDays.has(item.value);
              return (
                <Pressable
                  key={item.value}
                  style={[styles.weekdayPill, active && styles.weekdayPillActive]}
                  onPress={() => toggleRecurringDay(item.value)}
                >
                  <Text style={[styles.weekdayText, active && styles.weekdayTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.helperRow}>
            <Text style={styles.helperText}>Pick the weekdays this task repeats on.</Text>
          </View>
        </>
      );
    }
    if (repeatMode === "monthly") {
      const effectiveDay = monthlyDay ?? dayFromDate;
      // Default to the task's monthday if none selected yet.
      if (monthlyDay === null && dateInput) {
        const parsed = parseDateKey(dateInput);
        if (parsed) setMonthlyDay(parsed.getDate());
      }
      return (
        <View style={styles.repeatFieldRow}>
          <Text style={styles.scheduleFieldLabel}>On day</Text>
          <TextInput
            style={[styles.input, styles.inlineNumberInput]}
            keyboardType="number-pad"
            value={String(effectiveDay)}
            onChangeText={(value) => {
              const num = Math.min(31, Math.max(1, Number.parseInt(value || String(effectiveDay), 10) || effectiveDay));
              setMonthlyDay(num);
            }}
          />
          <Text style={styles.scheduleFieldLabel}>each month</Text>
        </View>
      );
    }
    if (repeatMode === "yearly") {
      return (
        <View style={styles.helperRow}>
          <Text style={styles.helperText}>Repeats every year on {dateLabel !== "Pick a date" ? dateLabel : "the set date"}.</Text>
        </View>
      );
    }
    return null;
  }

  async function handleSaveRecurrenceSettings() {
    if (!dateInput) {
      Alert.alert("Schedule required", "Set a due date before making the task recurring.");
      return;
    }
    if (repeatMode === "none") {
      await handleStopRecurrence();
      return;
    }
    try {
      let freq: RecurrenceRow["freq"] = "WEEKLY";
      let interval = 1;
      let byday: number[] | null = null;
      let by_monthday: number[] | null = null;
      if (repeatMode === "daily") {
        freq = "DAILY";
        interval = dailyInterval || 1;
      } else if (repeatMode === "weekly") {
        freq = "WEEKLY";
        const daySet = new Set(recurringDays);
        const parsed = parseDateKey(dateInput);
        if (parsed) {
          daySet.add(parsed.getDay());
        }
        byday = Array.from(daySet).sort();
      } else if (repeatMode === "monthly") {
        freq = "MONTHLY";
        const parsed = parseDateKey(dateInput);
        const fallback = parsed ? parsed.getDate() : new Date(dateInput).getDate();
        by_monthday = [monthlyDay ?? fallback];
      } else if (repeatMode === "yearly") {
        freq = "MONTHLY";
        interval = 12;
        const parsed = parseDateKey(dateInput);
        const fallback = parsed ? parsed.getDate() : new Date(dateInput).getDate();
        by_monthday = [monthlyDay ?? fallback];
      }

      const payload = {
        id: recurrenceId ?? undefined,
        title: title.trim() || "Untitled task",
        notes: notes || null,
        list_id: listAssignment ?? baseTask?.list_id ?? null,
        freq,
        interval,
        byday,
        by_monthday,
        start_date: dateInput,
        until: recurrenceUntil || null,
        estimate_minutes: baseTask?.estimate_minutes ?? null,
        priority: baseTask?.priority ?? null,
        active: true,
      };
      const result = await upsertRecurrence({
        ...payload,
        template_task_id: recurrenceId ? recurrenceQuery.data?.template_task_id ?? baseTask?.id ?? null : baseTask?.id ?? null,
      });
      const newRecurrenceId = result?.id ?? recurrenceId;
      if (!newRecurrenceId) return;
      // No longer delete the original task; it remains as the template referenced by the recurrence.
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["recurrence", newRecurrenceId] });
      Alert.alert("Saved", "This task is now repeating.");
    } catch (error) {
      console.error("Failed to save recurrence", error);
      Alert.alert("Could not save", "There was a problem making this task recurring. Please try again.");
    }
  }

  async function handleStopRecurrence() {
    if (!recurrenceId) {
      setRepeatMode("none");
      return;
    }
    try {
      await setRecurrenceActive(recurrenceId, false);
      setRepeatMode("none");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["recurrence", recurrenceId] });
      Alert.alert("Stopped", "This series is no longer repeating.");
    } catch (error) {
      console.error("Failed to stop recurrence", error);
      Alert.alert("Could not stop", "There was a problem stopping this recurrence.");
    }
  }

  return (
    <ScrollView
      style={scrollStyle}
      contentContainerStyle={[styles.container, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      <Section
        title="Schedule"
        sectionKey="schedule"
        open={!collapsed.schedule}
        onToggle={toggleSection}
        styles={styles}
        colors={colors}
      >
        <View style={styles.scheduleInputs}>
          <View style={styles.scheduleField}>
            <Text style={styles.scheduleFieldLabel}>Date</Text>
            <Pressable style={styles.scheduleFieldButton} onPress={() => openPicker("date")}>
              <Text style={styles.scheduleFieldValue}>{dateLabel}</Text>
            </Pressable>
          </View>
          <View style={styles.scheduleField}>
            <Text style={styles.scheduleFieldLabel}>Start</Text>
            <Pressable style={styles.scheduleFieldButton} onPress={() => openPicker("start")}>
              <Text style={styles.scheduleFieldValue}>{startLabel}</Text>
            </Pressable>
          </View>
          <View style={styles.scheduleField}>
            <Text style={styles.scheduleFieldLabel}>End</Text>
            <Pressable style={styles.scheduleFieldButton} onPress={() => openPicker("end")}>
              <Text style={styles.scheduleFieldValue}>{endLabel}</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.scheduleActions}>
          <Pressable onPress={handleClearSchedule} style={styles.scheduleActionButton}>
            <Text style={styles.scheduleActionText}>Clear schedule</Text>
          </Pressable>
          <Pressable onPress={openRepeatModal} style={styles.scheduleActionButton}>
            <Text style={styles.scheduleActionText}>Repeat task</Text>
          </Pressable>
        </View>
      </Section>

      <Section
        title="Title"
        sectionKey="title"
        open={!collapsed.title}
        onToggle={toggleSection}
        styles={styles}
        colors={colors}
      >
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            markDirty(true);
          }}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
        />
        <Pressable
          style={[styles.statusButton, status === "done" && styles.statusDone]}
          onPress={() => {
            setStatus((current) => (current === "done" ? "todo" : "done"));
            markDirty(true);
          }}
        >
          <Text style={styles.statusText}>{status === "done" ? "Mark Todo" : "Mark Done"}</Text>
        </Pressable>
      </Section>

      <Section
        title="Notes"
        sectionKey="notes"
        open={!collapsed.notes}
        onToggle={toggleSection}
        styles={styles}
        colors={colors}
      >
        <TextInput
          style={[styles.input, styles.notes]}
          multiline
          value={notes}
          onChangeText={(value) => {
            setNotes(value);
            markDirty(true);
          }}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
        />
      </Section>

      <Section
        title="List"
        sectionKey="list"
        open={!collapsed.list}
        onToggle={toggleSection}
        styles={styles}
        colors={colors}
      >
        {orderedLists.length ? (
          <View style={styles.listPicker}>
            {orderedLists.map((list) => {
              const active = list.id === listAssignment;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => handleSelectList(list.id)}
                  style={[styles.listOption, active && styles.listOptionActive]}
                >
                  <Text style={[styles.listOptionLabel, active && styles.listOptionLabelActive]}>
                    {list.name ?? "Untitled"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.helperText}>Lists are loading…</Text>
        )}
        <Text style={styles.helperText}>
          {(taskQuery.data?.list_id ?? baseTask?.list_id) ? `Currently in ${currentListName}` : "Not currently in a list"}
        </Text>
      </Section>

      <Section
        title="Subtasks"
        sectionKey="subtasks"
        open={!collapsed.subtasks}
        onToggle={toggleSection}
        styles={styles}
        colors={colors}
      >
        {(subtasks ?? []).map((item) => (
          <SubtaskItem
            key={item.id}
            item={item}
            onToggle={() => upsertSubtask({ ...item, done: !item.done })}
            onChangeTitle={(value) => upsertSubtask({ ...item, title: value })}
          />
        ))}
        <AddTaskInput placeholder="Add a subtask" onSubmit={handleAddSubtask} />
      </Section>

      {activePicker ? (
        Platform.OS === "android" ? (
          <PlatformDateTimePicker
            mode={activePicker === "date" || activePicker === "until" ? "date" : "time"}
            value={pendingPickerValue ?? getInitialPickerValue(activePicker)}
            onChange={(value) => {
              if (activePicker === "date") {
                handlePickDate(value);
              } else if (activePicker === "start") {
                handlePickStartTime(value);
              } else if (activePicker === "until") {
                handlePickUntil(value);
              } else {
                handlePickEndTime(value);
              }
            }}
            onCancel={closePicker}
          />
        ) : Platform.OS === "web" ? (
          <PlatformDateTimePicker
            mode={activePicker === "date" || activePicker === "until" ? "date" : "time"}
            value={pendingPickerValue ?? getInitialPickerValue(activePicker)}
            onChange={(value) => {
              if (activePicker === "date") {
                handlePickDate(value);
              } else if (activePicker === "start") {
                handlePickStartTime(value);
              } else if (activePicker === "until") {
                handlePickUntil(value);
              } else {
                handlePickEndTime(value);
              }
            }}
            onCancel={closePicker}
          />
        ) : (
          <Modal visible transparent animationType="fade" onRequestClose={closePicker}>
            <Pressable style={styles.pickerModalBackdrop} onPress={closePicker}>
              <Pressable style={styles.pickerModalCard} onPress={(event) => event.stopPropagation()}>
                <Text style={styles.pickerModalTitle}>
                  {activePicker === "date"
                    ? "Select date"
                    : activePicker === "start"
                      ? "Select start time"
                      : activePicker === "until"
                        ? "Select end date"
                        : "Select end time"}
                </Text>
                <PlatformDateTimePicker
                  mode={activePicker === "date" || activePicker === "until" ? "date" : "time"}
                  value={pendingPickerValue ?? getInitialPickerValue(activePicker)}
                  onChange={(value) => setPendingPickerValue(value)}
                />
                <View style={styles.pickerModalActions}>
                  <Pressable style={styles.pickerModalButton} onPress={closePicker}>
                    <Text style={styles.pickerModalButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.pickerModalButton, styles.pickerModalButtonPrimary]}
                    onPress={commitPendingPicker}
                  >
                    <Text style={[styles.pickerModalButtonText, styles.pickerModalButtonPrimaryText]}>Save</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )
      ) : null}
      
      {recurrencePrompt ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => handleRecurrenceDecision("cancel")}>
          <Pressable style={styles.pickerModalBackdrop} onPress={() => handleRecurrenceDecision("cancel")}>
            <Pressable style={styles.pickerModalCard} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.pickerModalTitle}>Apply changes</Text>
              <Text style={styles.helperText}>Do you want to update just this occurrence or the entire series?</Text>
              <View style={styles.pickerModalActions}>
                <Pressable style={styles.pickerModalButton} onPress={() => handleRecurrenceDecision("occurrence")}>
                  <Text style={styles.pickerModalButtonText}>This occurrence only</Text>
                </Pressable>
                <Pressable
                  style={[styles.pickerModalButton, styles.pickerModalButtonPrimary]}
                  onPress={() => handleRecurrenceDecision("series")}
                >
                  <Text style={[styles.pickerModalButtonText, styles.pickerModalButtonPrimaryText]}>Entire series</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => handleRecurrenceDecision("cancel")} style={[styles.pickerModalButton, { marginTop: 8 }]}>
                <Text style={styles.pickerModalButtonText}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {repeatModalOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setRepeatModalOpen(false)}>
          <Pressable style={styles.pickerModalBackdrop} onPress={() => setRepeatModalOpen(false)}>
            <Pressable style={styles.pickerModalCard} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.pickerModalTitle}>Repeat task</Text>
              <View style={styles.listPicker}>
                {repeatOptions.map((option) => {
                  const active = repeatMode === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      style={[styles.listOption, active && styles.listOptionActive]}
                      onPress={() => handleSelectRepeatMode(option.key)}
                    >
                      <Text style={[styles.listOptionLabel, active && styles.listOptionLabelActive]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {repeatMode !== "none" ? (
                <>
                  {renderRepeatSuboptions()}
                  <View style={styles.scheduleInputs}>
                    <View style={styles.scheduleField}>
                      <Text style={styles.scheduleFieldLabel}>Ends</Text>
                      <Pressable style={styles.scheduleFieldButton} onPress={() => openPicker("until")}>
                        <Text style={styles.scheduleFieldValue}>
                          {recurrenceUntil ? formatDateLabel(recurrenceUntil) : "No end date"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.scheduleActions}>
                    <Pressable
                      onPress={async () => {
                        await handleSaveRecurrenceSettings();
                        setRepeatModalOpen(false);
                      }}
                      style={styles.scheduleActionButtonPrimary}
                    >
                      <Text style={styles.scheduleActionTextPrimary}>{isRecurring ? "Update recurrence" : "Save repeat"}</Text>
                    </Pressable>
                    {isRecurring ? (
                      <Pressable
                        onPress={async () => {
                          await handleStopRecurrence();
                          setRepeatModalOpen(false);
                        }}
                        style={styles.scheduleActionButton}
                      >
                        <Text style={styles.scheduleActionText}>Stop recurrence</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              ) : (
                <View style={styles.helperRow}>
                  <Text style={styles.helperText}>Not repeating. Pick a pattern above to start repeating.</Text>
                </View>
              )}
              <View style={styles.pickerModalActions}>
                <Pressable style={styles.pickerModalButton} onPress={() => setRepeatModalOpen(false)}>
                  <Text style={styles.pickerModalButtonText}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

    </ScrollView>
  );
});

type SectionProps = {
  title: string;
  sectionKey: SectionKey;
  open: boolean;
  onToggle: (key: SectionKey) => void;
  styles: Styles;
  colors: ThemeColors;
  children: ReactNode;
};

function Section({ title, sectionKey, open, onToggle, styles, colors, children }: SectionProps) {
  const pointer = open ? "auto" : "none";
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={() => onToggle(sectionKey)}>
        <Text style={styles.sectionHeaderText}>{title}</Text>
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={colors.textSecondary} />
      </Pressable>
      <View
        style={[
          styles.sectionBody,
          !open && styles.sectionBodyCollapsed,
          Platform.OS === "web" ? { pointerEvents: pointer } : null,
        ]}
        pointerEvents={Platform.OS === "web" ? undefined : pointer}
      >
        {children}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      padding: 20,
      backgroundColor: colors.background,
      flexGrow: 1,
      gap: 12,
    },
    section: {
      gap: 8,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionHeaderText: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    sectionBody: {
      gap: 8,
    },
    sectionBodyCollapsed: {
      height: 0,
      overflow: "hidden",
      opacity: 0,
    },
    label: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.inputBackground,
    },
    notes: {
      minHeight: 120,
      textAlignVertical: "top",
    },
    statusButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignSelf: "flex-start",
    },
    statusDone: {
      backgroundColor: colors.success,
    },
    statusText: {
      color: colors.text,
      fontWeight: "600",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    listPicker: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    listOption: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: colors.inputBackground,
    },
    listOptionActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentMuted,
    },
    listOptionLabel: {
      color: colors.textSecondary,
      fontWeight: "500",
    },
    listOptionLabelActive: {
      color: colors.surface,
    },
    helperText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    scheduleSummary: {
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.inputBackground,
    },
    scheduleSummaryText: {
      color: colors.text,
    },
    scheduleInputs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginTop: 8,
    },
    scheduleField: {
      flexGrow: 1,
      minWidth: 120,
    },
    scheduleFieldLabel: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 4,
    },
    scheduleFieldButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.inputBackground,
    },
    scheduleFieldValue: {
      color: colors.text,
      fontWeight: "500",
    },
    scheduleActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 8,
      flexWrap: "wrap",
      gap: 8,
    },
    repeatHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    repeatToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    scheduleActionButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scheduleActionButtonPrimary: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    scheduleActionText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "500",
    },
    scheduleActionTextPrimary: {
      color: colors.primaryText,
      fontSize: 13,
      fontWeight: "700",
    },
    repeatFieldRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    inlineNumberInput: {
      minWidth: 64,
      paddingVertical: 8,
      textAlign: "center",
    },
    helperRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    weekdayRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    weekdayPill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.surface,
    },
    weekdayPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    weekdayText: {
      color: colors.text,
      fontWeight: "600",
      fontSize: 13,
    },
    weekdayTextActive: {
      color: colors.primaryText,
    },
    pickerModalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    pickerModalCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      gap: 16,
    },
    pickerModalTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    pickerModalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
    },
    pickerModalButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    pickerModalButtonText: {
      color: colors.text,
      fontWeight: "500",
    },
    pickerModalButtonPrimary: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    pickerModalButtonPrimaryText: {
      color: colors.surface,
    },
  });
}
