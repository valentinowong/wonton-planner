import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LocalTask } from "../../data/local/db";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemeColors, ThemeMode } from "../../theme";

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
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <Pressable
      onPress={() => onPress?.(task)}
      style={[styles.card, isDone && styles.cardDone, active && styles.cardActive]}
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
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      marginBottom: 10,
      gap: 10,
      ...baseShadow,
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
    dragHandle: {
      width: 24,
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.8,
    },
  });
}
