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
  showAssigneeChip?: boolean;
  muted?: boolean;
  highlightMine?: boolean;
};

export function ListTaskItem({
  task,
  onToggle,
  onPress,
  subtitle,
  dataSet,
  active = false,
  showGrabHandle = false,
  showAssigneeChip = false,
  muted = false,
  highlightMine = false,
}: Props) {
  const isDone = task.status === "done";
  const { colors, mode } = useTheme();
  const scheduleState = useMemo(() => getTaskScheduleState(task), [task.due_date, task.planned_end, task.planned_start]);
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const scheduleStyleKey =
    scheduleState === "unscheduled" ? "cardUnscheduled" : scheduleState === "dateOnly" ? "cardDateOnly" : "cardTimed";

  const assigneeInitials = useMemo(() => {
    if (!task.assignee_id) return null;
    const source = task.assignee_display_name || task.assignee_email || "";
    const parts = source
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0 && task.assignee_email) {
      const emailName = task.assignee_email.split("@")[0];
      const emailPart = emailName.replace(/[^A-Za-z0-9]/g, "").slice(0, 2);
      return emailPart.toUpperCase() || null;
    }
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "";
    const initials = `${first}${last}`.toUpperCase().slice(0, 2);
    return initials || null;
  }, [task.assignee_display_name, task.assignee_email, task.assignee_id]);

  const assigneeLabel = useMemo(() => {
    if (task.assignee_display_name) return task.assignee_display_name;
    if (task.assignee_email) return task.assignee_email;
    if (task.assignee_id) return "Assigned";
    return "Unassigned";
  }, [task.assignee_display_name, task.assignee_email, task.assignee_id]);

  return (
    <Pressable
      onPress={() => onPress?.(task)}
      style={[
        styles.card,
        highlightMine && !muted ? styles.cardMine : styles[scheduleStyleKey],
        muted && styles.cardMuted,
        isDone && styles.cardDone,
        active && styles.cardActive,
      ]}
      dataSet={dataSet}
      collapsable={false}
    >
      <Pressable
        onPress={() => onToggle(task)}
        style={[
          styles.checkbox,
          isDone && styles.checkboxDone,
          muted && styles.checkboxMuted,
          highlightMine && !muted && styles.checkboxMine,
        ]}
      />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, muted && styles.titleMuted, isDone && styles.titleDone]} numberOfLines={2}>
            {task.title}
          </Text>
          {showAssigneeChip ? (
            <View style={styles.assigneeChip} accessibilityLabel={`Assignee: ${assigneeLabel}`}>
              {task.assignee_id ? (
                assigneeInitials ? (
                  <Text style={styles.assigneeText}>{assigneeInitials}</Text>
                ) : (
                  <Ionicons name="person" size={14} color={colors.textSecondary} />
                )
              ) : (
                <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
              )}
            </View>
          ) : null}
        </View>
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
    cardMine: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: withAlpha(colors.primary, mode === "dark" ? 0.22 : 0.14),
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
    cardMuted: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.border,
      borderWidth: 1,
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
    checkboxMuted: {
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    checkboxMine: {
      borderColor: colors.primary,
    },
    content: {
      flex: 1,
    },
    title: {
      fontWeight: "600",
      color: colors.text,
      flex: 1,
    },
    titleMuted: {
      color: colors.textSecondary,
    },
    titleDone: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
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
    assigneeChip: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    assigneeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text,
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
