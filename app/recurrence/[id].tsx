import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "../../src/services/api/client";
import { useLists } from "../../src/hooks/useLists";
import { useTheme } from "../../src/contexts/ThemeContext";
import type { ThemeColors } from "../../src/theme";

const freqOptions = ["DAILY", "WEEKLY", "MONTHLY"] as const;

type RecurrenceRow = {
  id: string;
  title: string;
  notes: string | null;
  freq: (typeof freqOptions)[number];
  interval: number;
  start_date: string;
  list_id: string | null;
  byday: number[] | null;
  by_monthday: number[] | null;
  active: boolean;
};

export default function EditRecurrenceScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const recurrenceId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id ?? ""), [params.id]);
  const router = useRouter();
  const { data: lists } = useLists();

  const recurrenceQuery = useQuery({
    queryKey: ["recurrence", recurrenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurrences")
        .select("*")
        .eq("id", recurrenceId)
        .single();
      if (error) throw error;
      return data as RecurrenceRow;
    },
    enabled: Boolean(recurrenceId),
  });

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [freq, setFreq] = useState<(typeof freqOptions)[number]>("DAILY");
  const [interval, setInterval] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [listId, setListId] = useState<string | undefined>(undefined);
  const [byday, setByday] = useState("");
  const [monthday, setMonthday] = useState("");

  useEffect(() => {
    if (recurrenceQuery.data) {
      setTitle(recurrenceQuery.data.title);
      setNotes(recurrenceQuery.data.notes ?? "");
      setFreq(recurrenceQuery.data.freq);
      setInterval(String(recurrenceQuery.data.interval));
      setStartDate(recurrenceQuery.data.start_date);
      setListId(recurrenceQuery.data.list_id ?? undefined);
      setByday((recurrenceQuery.data.byday ?? []).join(","));
      setMonthday((recurrenceQuery.data.by_monthday ?? []).join(","));
    }
  }, [recurrenceQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const bydayValues = byday
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => Number(v))
        .filter((n) => !Number.isNaN(n));
      const monthValues = monthday
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => Number(v))
        .filter((n) => !Number.isNaN(n));
      const payload = {
        title,
        notes,
        freq,
        interval: Number(interval) || 1,
        start_date: startDate,
        list_id: listId ?? lists?.[0]?.id,
        byday: bydayValues.length ? bydayValues : null,
        by_monthday: monthValues.length ? monthValues : null,
      };
      const { error } = await supabase.from("recurrences").update(payload).eq("id", recurrenceId);
      if (error) throw error;
    },
    onSuccess: () => router.back(),
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const nextActive = !recurrenceQuery.data?.active;
      const { error } = await supabase
        .from("recurrences")
        .update({ active: nextActive })
        .eq("id", recurrenceId);
      if (error) throw error;
    },
    onSuccess: () => recurrenceQuery.refetch(),
  });

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <Text style={styles.label}>Frequency</Text>
      <View style={styles.pillRow}>
        {freqOptions.map((option) => (
          <Pressable
            key={option}
            style={[styles.pill, freq === option && styles.pillActive]}
            onPress={() => setFreq(option)}
          >
            <Text style={styles.pillText}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Interval</Text>
      <TextInput style={styles.input} value={interval} onChangeText={setInterval} keyboardType="number-pad" />

      <Text style={styles.label}>Start Date</Text>
      <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} />

      <Text style={styles.label}>By Day (0-6 comma separated)</Text>
      <TextInput style={styles.input} value={byday} onChangeText={setByday} />

      <Text style={styles.label}>By Month Day (1-31 comma separated)</Text>
      <TextInput style={styles.input} value={monthday} onChangeText={setMonthday} />

      <Text style={styles.label}>List</Text>
      <View style={styles.pillRow}>
        {(lists ?? []).map((list) => (
          <Pressable
            key={list.id}
            style={[styles.pill, listId === list.id && styles.pillActive]}
            onPress={() => setListId(list.id)}
          >
            <Text style={styles.pillText}>{list.name}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.saveButton} onPress={() => updateMutation.mutate()}>
        <Text style={styles.saveText}>Save Changes</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => toggleMutation.mutate()}>
        <Text style={styles.secondaryText}>
          {recurrenceQuery.data?.active ? "Deactivate" : "Activate"} Recurrence
        </Text>
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
    secondaryButton: {
      borderWidth: 1,
      borderColor: colors.danger,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      marginTop: 12,
    },
    secondaryText: {
      color: colors.danger,
      fontWeight: "600",
    },
  });
}
