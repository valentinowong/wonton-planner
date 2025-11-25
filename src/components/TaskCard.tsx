import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LocalTask } from "../lib/db";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeColors, ThemeMode } from "../theme";

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
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <Pressable onPress={() => onPress?.(task)} style={[styles.card, isDone && styles.cardDone]}>
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
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
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
      backgroundColor: colors.success,
      borderColor: colors.success,
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
