import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LocalTask } from "../../data/local/db";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemeColors, ThemeMode } from "../../theme";
import { getTaskScheduleState } from "../../domain/tasks/schedule";

type Props = {
  task: LocalTask;
  onToggleStatus?: (task: LocalTask) => void;
  onPress?: (task: LocalTask) => void;
  detailText?: string | null;
  badgeText?: string | null;
  showGrabHandle?: boolean;
};

export function TaskCard({ task, onToggleStatus, onPress, detailText, badgeText, showGrabHandle = false }: Props) {
  const isDone = task.status === "done";
  const { colors, mode } = useTheme();
  const scheduleState = useMemo(() => getTaskScheduleState(task), [task.due_date, task.planned_end, task.planned_start]);
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const scheduleStyleKey =
    scheduleState === "unscheduled" ? "cardUnscheduled" : scheduleState === "dateOnly" ? "cardDateOnly" : "cardTimed";

  return (
    <Pressable
      onPress={() => onPress?.(task)}
      style={[styles.card, styles[scheduleStyleKey], isDone && styles.cardDone]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={() => onToggleStatus?.(task)}
          style={[styles.checkbox, isDone && styles.checkboxDone]}
        />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={2}>
              {task.title}
            </Text>
            {badgeText ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeText}</Text>
              </View>
            ) : null}
          </View>
          {detailText ? <Text style={styles.detail}>{detailText}</Text> : null}
          {task.notes ? (
            <Text style={styles.notes} numberOfLines={2}>
              {task.notes}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, mode: ThemeMode) {
  const unscheduledTint = withAlpha(colors.textMuted, mode === "dark" ? 0.14 : 0.08);
  const dateOnlyTint = withAlpha(colors.primary, mode === "dark" ? 0.14 : 0.07);
  const timedTint = withAlpha(colors.primary, mode === "dark" ? 0.22 : 0.12);
  const dateOnlyBorder = withAlpha(colors.primary, mode === "dark" ? 0.85 : 0.55);
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
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
      opacity: 0.6,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
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
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      flex: 1,
    },
    titleDone: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
    detail: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    notes: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: "flex-start",
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
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
