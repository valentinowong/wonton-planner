import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LocalTask } from "../lib/db";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeColors, ThemeMode } from "../theme";

type Props = {
  task: LocalTask;
  onToggleStatus?: (task: LocalTask) => void;
  onPress?: (task: LocalTask) => void;
};

export function TaskCard({ task, onToggleStatus, onPress }: Props) {
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
          <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={2}>
            {task.title}
          </Text>
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
      shadowColor: mode === "dark" ? "rgba(0,0,0,0.6)" : "rgba(15,23,42,0.15)",
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
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
    title: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    titleDone: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
    notes: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
  });
}
