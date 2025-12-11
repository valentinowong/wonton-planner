import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LocalTask } from "../../data/local/db";
import { getTaskScheduleState } from "../../domain/tasks/schedule";
import type { ThemeColors, ThemeMode } from "../../theme";
import { useTheme } from "../../theme/ThemeContext";

type Props = {
  task: LocalTask;
  onToggleStatus?: (task: LocalTask) => void;
  onPress?: (task: LocalTask) => void;
  detailText?: string | null;
  badgeText?: string | null;
  showGrabHandle?: boolean;
  showAssigneeChip?: boolean;
  muted?: boolean;
};

export function TaskCard({
  task,
  onToggleStatus,
  onPress,
  detailText,
  badgeText,
  showGrabHandle = false,
  showAssigneeChip = false,
  muted = false,
}: Props) {
  const isDone = task.status === "done";
  const { colors, mode } = useTheme();
  const scheduleState = useMemo(
    () => getTaskScheduleState(task),
    [task.due_date, task.planned_end, task.planned_start],
  );
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const baseKey =
    scheduleState === "unscheduled" ? "cardUnscheduled" : scheduleState === "dateOnly" ? "cardDateOnly" : "cardTimed";
  const scheduleStyleKey = muted ? `${baseKey}Muted` : baseKey;

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
  const hasPlannedTime = Boolean(task.planned_start || task.planned_end);

  return (
    <Pressable
      onPress={() => onPress?.(task)}
      style={[styles.card, styles[scheduleStyleKey], isDone && styles.cardDone]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={() => onToggleStatus?.(task)}
          style={[styles.checkbox, isDone && styles.checkboxDone, muted && styles.checkboxMuted]}
        />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, muted && styles.titleMuted, isDone && styles.titleDone]} numberOfLines={2}>
              {task.title}
            </Text>
            {!hasPlannedTime && showAssigneeChip ? (
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
          <View style={styles.metaRow}>
            {detailText ? (
              <Text style={[styles.detail, muted && styles.detailMuted]}>{detailText}</Text>
            ) : (
              <View style={styles.detailPlaceholder} />
            )}
            {badgeText ? (
              <View style={styles.badge}>
                <Text style={[styles.badgeText, muted && styles.badgeTextMuted]}>{badgeText}</Text>
              </View>
            ) : null}
            {hasPlannedTime && showAssigneeChip ? (
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
  // Muted (other-assignee / unassigned) variants lean on greys to stay subdued while still showing schedule state.
  const mutedDateBg = withAlpha(colors.textMuted, mode === "dark" ? 0.26 : 0.16);
  const mutedDateBorder = withAlpha(colors.textMuted, mode === "dark" ? 0.6 : 0.42);
  const mutedTimedBg = withAlpha(colors.textMuted, mode === "dark" ? 0.38 : 0.24);
  const mutedTimedBorder = withAlpha(colors.textMuted, mode === "dark" ? 0.8 : 0.58);
  const mutedUnscheduledBg = withAlpha(colors.textMuted, mode === "dark" ? 0.12 : 0.07);
  const mutedUnscheduledBorder = withAlpha(colors.textMuted, mode === "dark" ? 0.42 : 0.28);
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
    cardUnscheduledMuted: {
      borderWidth: 1,
      borderColor: mutedUnscheduledBorder,
      borderStyle: "dashed",
      backgroundColor: mutedUnscheduledBg,
    },
    cardDateOnly: {
      borderWidth: 1,
      borderColor: dateOnlyBorder,
      backgroundColor: dateOnlyTint,
    },
    cardDateOnlyMuted: {
      borderWidth: 1.1,
      borderColor: mutedDateBorder,
      backgroundColor: mutedDateBg,
    },
    cardTimed: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: timedTint,
    },
    cardTimedMuted: {
      borderWidth: 1.6,
      borderColor: mutedTimedBorder,
      backgroundColor: mutedTimedBg,
    },
    cardDone: {
      opacity: 0.6,
    },
    cardMuted: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.border,
      borderWidth: 1,
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
    checkboxMuted: {
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
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
    titleMuted: {
      color: colors.textSecondary,
    },
    titleDone: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
    metaRow: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    detail: {
      fontSize: 13,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    detailMuted: {
      color: colors.textMuted,
    },
    detailPlaceholder: {
      flex: 1,
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
      alignSelf: "flex-end",
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    badgeTextMuted: {
      color: colors.textMuted,
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
      marginLeft: 6,
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
