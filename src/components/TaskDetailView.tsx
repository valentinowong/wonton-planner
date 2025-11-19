import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, type StyleProp, type ViewStyle } from "react-native";
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

export function TaskDetailView({ taskId, scrollStyle, contentStyle }: Props) {
  const queryClient = useQueryClient();
  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask(taskId),
    enabled: Boolean(taskId),
  });
  const { data: subtasks, upsertSubtask } = useSubtasks(taskId);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (taskQuery.data) {
      setTitle(taskQuery.data.title);
      setNotes(taskQuery.data.notes ?? "");
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
  });
}
