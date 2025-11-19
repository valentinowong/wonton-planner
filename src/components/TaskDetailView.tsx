import { useEffect, useMemo, useState } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/api/client";
import { queueTaskMutation } from "../lib/sync";
import type { LocalTask } from "../lib/db";
import { useSubtasks } from "../hooks/useSubtasks";
import { SubtaskItem } from "./SubtaskItem";
import { AddTaskInput } from "./AddTaskInput";
import { generateUUID } from "../lib/uuid";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeColors } from "../theme";
import { useLists } from "../hooks/useLists";
import { PlatformDateTimePicker } from "./PlatformDateTimePicker";

async function fetchTask(taskId: string) {
  const { data, error } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (error) throw error;
  return data as LocalTask;
}

type Props = {
  taskId: string;
  scrollStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

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
  return date.toISOString().split("T")[0];
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
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

type PickerType = "date" | "start" | "end";

export function TaskDetailView({ taskId, scrollStyle, contentStyle }: Props) {
  const queryClient = useQueryClient();
  const { data: listsData } = useLists();
  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask(taskId),
    enabled: Boolean(taskId),
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

  useEffect(() => {
    if (taskQuery.data) {
      setTitle(taskQuery.data.title);
      setNotes(taskQuery.data.notes ?? "");
      setDateInput(taskQuery.data.due_date ?? "");
      setStartTimeInput(formatTimeInputValue(taskQuery.data.planned_start));
      setEndTimeInput(formatTimeInputValue(taskQuery.data.planned_end));
      setListAssignment(taskQuery.data.list_id ?? null);
    }
  }, [taskQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (changes: Partial<LocalTask>) => {
      if (!taskQuery.data) return;
      await queueTaskMutation({ ...taskQuery.data, ...changes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["backlog"] });
    },
  });

  async function handleSaveTitle() {
    if (!title.trim()) return;
    await saveMutation.mutateAsync({ title: title.trim() });
  }

  async function handleSaveNotes() {
    await saveMutation.mutateAsync({ notes });
  }

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

  function handleSelectList(listId: string) {
    if (!taskQuery.data) return;
    if (listAssignment === listId && !dateInput) return;
    setDateInput("");
    setStartTimeInput("");
    setEndTimeInput("");
    setListAssignment(listId);
    saveMutation.mutate({
      list_id: listId,
      due_date: null,
      planned_start: null,
      planned_end: null,
    });
  }

  function openPicker(kind: PickerType) {
    if (kind !== "date" && !dateInput) {
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
    const changes: Partial<LocalTask> = { due_date: dateKey, list_id: null };
    if (startParsed) {
      const startDate = combineDateAndTime(dateKey, startParsed.hours, startParsed.minutes);
      if (startDate) {
        changes.planned_start = startDate.toISOString();
        if (endParsed) {
          const endDate = combineDateAndTime(dateKey, endParsed.hours, endParsed.minutes);
          if (endDate) {
            changes.planned_end = endDate.toISOString();
          }
        } else if (taskQuery.data?.planned_end && taskQuery.data?.planned_start) {
          const duration =
            new Date(taskQuery.data.planned_end).getTime() - new Date(taskQuery.data.planned_start).getTime();
          if (duration > 0) {
            const carriedEnd = new Date(startDate.getTime() + duration);
            changes.planned_end = carriedEnd.toISOString();
            setEndTimeInput(formatTimeInputValue(carriedEnd.toISOString()));
          }
        }
      }
    } else {
      changes.planned_start = null;
      changes.planned_end = null;
      setStartTimeInput("");
      setEndTimeInput("");
    }
    setListAssignment(null);
    saveMutation.mutate(changes);
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
    const changes: Partial<LocalTask> = {
      due_date: dateKey,
      planned_start: nextStart.toISOString(),
      planned_end: nextEnd?.toISOString() ?? null,
      list_id: null,
    };
    setListAssignment(null);
    saveMutation.mutate(changes);
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
    setListAssignment(null);
    saveMutation.mutate({ due_date: dateKey, planned_end: nextEnd.toISOString(), list_id: null });
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
    } else {
      handlePickEndTime(pendingPickerValue);
    }
    closePicker();
  }


  function handleClearSchedule() {
    setDateInput("");
    setStartTimeInput("");
    setEndTimeInput("");
    closePicker();
    const fallbackListId = listAssignment ?? orderedLists[0]?.id ?? null;
    setListAssignment(fallbackListId);
    saveMutation.mutate({
      due_date: null,
      planned_start: null,
      planned_end: null,
      list_id: fallbackListId,
    });
  }

  return (
    <ScrollView style={scrollStyle} contentContainerStyle={[styles.container, contentStyle]}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        onBlur={handleSaveTitle}
      />
      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        multiline
        value={notes}
        onChangeText={setNotes}
        onBlur={handleSaveNotes}
      />

      <Pressable
        style={[styles.statusButton, taskQuery.data?.status === "done" && styles.statusDone]}
        onPress={() =>
          saveMutation.mutate({ status: taskQuery.data?.status === "done" ? "todo" : "done" })
        }
      >
        <Text style={styles.statusText}>
          {taskQuery.data?.status === "done" ? "Mark Todo" : "Mark Done"}
        </Text>
      </Pressable>

      <Text style={styles.label}>List</Text>
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
        {taskQuery.data?.list_id ? `Currently in ${currentListName}` : "Not currently in a list"}
      </Text>

      <Text style={styles.label}>Schedule</Text>
      <View style={styles.scheduleSummary}>
        <Text style={styles.scheduleSummaryText}>{scheduleSummary}</Text>
      </View>
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
      </View>
      <Text style={styles.helperText}>Dates use YYYY-MM-DD. Times use 24-hour HH:MM.</Text>

      {activePicker ? (
        Platform.OS === "android" ? (
          <PlatformDateTimePicker
            mode={activePicker === "date" ? "date" : "time"}
            value={pendingPickerValue ?? getInitialPickerValue(activePicker)}
            onChange={(value) => {
              if (activePicker === "date") {
                handlePickDate(value);
              } else if (activePicker === "start") {
                handlePickStartTime(value);
              } else {
                handlePickEndTime(value);
              }
            }}
            onCancel={closePicker}
          />
        ) : Platform.OS === "web" ? (
          <PlatformDateTimePicker
            mode={activePicker === "date" ? "date" : "time"}
            value={pendingPickerValue ?? getInitialPickerValue(activePicker)}
            onChange={(value) => {
              if (activePicker === "date") {
                handlePickDate(value);
              } else if (activePicker === "start") {
                handlePickStartTime(value);
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
                      : "Select end time"}
                </Text>
                <PlatformDateTimePicker
                  mode={activePicker === "date" ? "date" : "time"}
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

      <Text style={styles.sectionTitle}>Subtasks</Text>
      {(subtasks ?? []).map((item) => (
        <SubtaskItem
          key={item.id}
          item={item}
          onToggle={() => upsertSubtask({ ...item, done: !item.done })}
          onChangeTitle={(value) => upsertSubtask({ ...item, title: value })}
        />
      ))}
      <AddTaskInput placeholder="Add a subtask" onSubmit={handleAddSubtask} />
    </ScrollView>
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
    },
    scheduleActionButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scheduleActionText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "500",
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
