import { useMemo } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type { RemoteSubtask } from "../../features/planner/hooks/useSubtasks";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemeColors } from "../../theme";

type Props = {
  item: RemoteSubtask;
  onToggle?: (item: RemoteSubtask) => void;
  onChangeTitle?: (value: string, item: RemoteSubtask) => void;
};

export function SubtaskItem({ item, onToggle, onChangeTitle }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onToggle?.(item)}
        style={[styles.checkbox, item.done && styles.checkboxDone]}
      />
      <TextInput
        style={[styles.input, item.done && styles.inputDone]}
        value={item.title}
        onChangeText={(text) => onChangeTitle?.(text, item)}
        placeholder="Subtask"
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 12,
    },
    checkboxDone: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
    },
    inputDone: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
  });
}
