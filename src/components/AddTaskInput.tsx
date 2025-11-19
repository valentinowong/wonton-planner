import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeColors } from "../theme";

const BUTTON_SIZE = 40;
const BUTTON_OFFSET = 8;

type Props = {
  placeholder?: string;
  onSubmit?: (title: string) => Promise<void> | void;
};

export function AddTaskInput({ placeholder = "Quick add", onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const trimmedValue = useMemo(() => value.trim(), [value]);
  const canSubmit = Boolean(trimmedValue) && !loading;

  async function handleSubmit() {
    if (!trimmedValue || loading) return;
    setLoading(true);
    try {
      await onSubmit?.(trimmedValue);
      setValue("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={styles.input}
        value={value}
        editable={!loading}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />
      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primaryText} />
        ) : (
          <Text style={styles.buttonText}>+</Text>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 14,
      paddingRight: BUTTON_SIZE + BUTTON_OFFSET + 4,
      paddingVertical: BUTTON_OFFSET,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: colors.inputBackground,
      marginBottom: 16,
      overflow: "hidden",
      position: "relative",
      minHeight: BUTTON_SIZE + BUTTON_OFFSET * 2,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 2,
    },
    button: {
      position: "absolute",
      right: BUTTON_OFFSET,
      top: BUTTON_OFFSET,
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      backgroundColor: colors.primary,
      borderRadius: BUTTON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: colors.primaryText,
      fontWeight: "600",
    },
  });
}
