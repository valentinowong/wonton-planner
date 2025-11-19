import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "../../src/services/api/client";
import { useLists } from "../../src/hooks/useLists";
import { useTheme } from "../../src/contexts/ThemeContext";
import type { ThemeColors } from "../../src/theme";

const freqOptions = ["DAILY", "WEEKLY", "MONTHLY"] as const;

type FormState = {
  title: string;
  notes: string;
  freq: (typeof freqOptions)[number];
  interval: string;
  start_date: string;
  list_id?: string;
};

export default function NewRecurrenceScreen() {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<FormState>({
    title: "",
    notes: "",
    freq: "DAILY",
    interval: "1",
    start_date: today,
  });
  const { data: lists } = useLists();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        notes: form.notes,
        freq: form.freq,
        interval: Number(form.interval) || 1,
        start_date: form.start_date,
        list_id: form.list_id ?? lists?.[0]?.id,
      };
      const { error } = await supabase.from("recurrences").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => router.back(),
  });

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={form.title}
        onChangeText={(value) => updateField("title", value)}
      />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        multiline
        value={form.notes}
        onChangeText={(value) => updateField("notes", value)}
      />

      <Text style={styles.label}>Frequency</Text>
      <View style={styles.pillRow}>
        {freqOptions.map((option) => (
          <Pressable
            key={option}
            style={[styles.pill, form.freq === option && styles.pillActive]}
            onPress={() => updateField("freq", option)}
          >
            <Text style={styles.pillText}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Interval</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={form.interval}
        onChangeText={(value) => updateField("interval", value)}
      />

      <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={form.start_date}
        onChangeText={(value) => updateField("start_date", value)}
      />

      <Text style={styles.label}>List</Text>
      <View style={styles.pillRow}>
        {(lists ?? []).map((list) => (
          <Pressable
            key={list.id}
            style={[styles.pill, form.list_id === list.id && styles.pillActive]}
            onPress={() => updateField("list_id", list.id)}
          >
            <Text style={styles.pillText}>{list.name}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.saveButton} onPress={() => mutation.mutate()}>
        <Text style={styles.saveText}>Save Recurrence</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      padding: 20,
      backgroundColor: colors.background,
      flexGrow: 1,
    },
    label: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
      marginTop: 12,
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
      minHeight: 100,
      textAlignVertical: "top",
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 12,
      marginTop: 8,
    },
    pill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginRight: 8,
      marginTop: 8,
      backgroundColor: colors.surface,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillText: {
      color: colors.text,
      fontWeight: "600",
    },
    saveButton: {
      backgroundColor: colors.primary,
      marginTop: 24,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
    },
    saveText: {
      color: colors.primaryText,
      fontWeight: "700",
      fontSize: 16,
    },
  });
}
