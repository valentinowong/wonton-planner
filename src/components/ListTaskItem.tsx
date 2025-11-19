import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LocalTask } from "../lib/db";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeColors, ThemeMode } from "../theme";

type Props = {
  task: LocalTask;
  onToggle: (task: LocalTask) => void;
  onPress?: (task: LocalTask) => void;
  subtitle?: string | null;
  onBeginDrag?: (task: LocalTask) => void;
};

export function ListTaskItem({ task, onToggle, onPress, subtitle, onBeginDrag }: Props) {
  const isDone = task.status === "done";
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <Pressable
      onPress={() => onPress?.(task)}
      style={[styles.card, isDone && styles.cardDone]}
      onLongPress={() => onBeginDrag?.(task)}
      delayLongPress={250}
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
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, mode: ThemeMode) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      marginBottom: 10,
      shadowColor: mode === "dark" ? "rgba(0,0,0,0.6)" : "rgba(15,23,42,0.15)",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 1,
    },
    cardDone: {
      opacity: 0.55,
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
      backgroundColor: colors.successAlt,
      borderColor: colors.successAlt,
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
  });
}
