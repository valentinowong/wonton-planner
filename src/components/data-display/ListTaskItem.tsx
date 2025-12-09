import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LocalTask } from "../../data/local/db";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemeColors, ThemeMode } from "../../theme";
import { getTaskScheduleState } from "../../domain/tasks/schedule";

type Props = {
  task: LocalTask;
  onToggle: (task: LocalTask) => void;
  onPress?: (task: LocalTask) => void;
  subtitle?: string | null;
  dataSet?: Record<string, string>;
  active?: boolean;
  showGrabHandle?: boolean;
};

export function ListTaskItem({ task, onToggle, onPress, subtitle, dataSet, active = false, showGrabHandle = false }: Props) {
  const isDone = task.status === "done";
  const { colors, mode } = useTheme();
  const scheduleState = useMemo(() => getTaskScheduleState(task), [task.due_date, task.planned_end, task.planned_start]);
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const scheduleStyleKey =
    scheduleState === "unscheduled" ? "cardUnscheduled" : scheduleState === "dateOnly" ? "cardDateOnly" : "cardTimed";

  return (
    <Pressable
      onPress={() => onPress?.(task)}
      style={[styles.card, styles[scheduleStyleKey], isDone && styles.cardDone, active && styles.cardActive]}
      dataSet={dataSet}
      collapsable={false}
    >
      <Pressable onPress={() => onToggle(task)} style={[styles.checkbox, isDone && styles.checkboxDone]} />
      <View style={styles.content}>
        <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showGrabHandle ? (
        <View style={styles.dragHandle}>
          <Ionicons name="reorder-three-outline" size={20} color={colors.textMuted} />
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, mode: ThemeMode) {
  const baseShadow = Platform.OS === "web"
    ? { boxShadow: mode === "dark" ? "0 4px 10px rgba(0,0,0,0.6)" : "0 4px 10px rgba(15,23,42,0.15)" }
    : {
        shadowColor: mode === "dark" ? "rgba(0,0,0,0.6)" : "rgba(15,23,42,0.15)",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
      };
  const activeShadow = Platform.OS === "web"
    ? { boxShadow: `0 4px 12px ${colors.accent}40` }
    : {
        shadowColor: colors.accent,
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      };
  const unscheduledTint = withAlpha(colors.textMuted, mode === "dark" ? 0.14 : 0.08);
  const dateOnlyTint = withAlpha(colors.primary, mode === "dark" ? 0.14 : 0.07);
  const timedTint = withAlpha(colors.primary, mode === "dark" ? 0.22 : 0.12);
  const dateOnlyBorder = withAlpha(colors.primary, mode === "dark" ? 0.85 : 0.55);
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      gap: 10,
      ...baseShadow,
    },
    cardUnscheduled: {
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
      backgroundColor: unscheduledTint,
    },
    cardDateOnly: {
      borderWidth: 1,
      borderColor: dateOnlyBorder,
      backgroundColor: dateOnlyTint,
    },
    cardTimed: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: timedTint,
    },
    cardDone: {
      opacity: 0.55,
    },
    cardActive: {
      borderWidth: 1,
      borderColor: colors.accent,
      ...activeShadow,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.borderMuted,
      marginRight: 12,
    },
    checkboxDone: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    content: {
      flex: 1,
    },
    title: {
      fontWeight: "600",
      color: colors.text,
    },
    titleDone: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
    subtitle: {
      marginTop: 4,
      color: colors.textSecondary,
      fontSize: 13,
    },
    dragHandle: {
      width: 24,
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.8,
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
