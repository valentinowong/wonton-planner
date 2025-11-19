import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeColors } from "../theme";

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
          <Text style={styles.buttonText}>Add</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.inputBackground,
    marginBottom: 16,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 2,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 14,
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
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
