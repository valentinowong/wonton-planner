import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeColors, ThemeMode } from "../theme";

type Option = {
  label: string;
  value: string;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
};

export function SegmentedControl({ options, value, onChange, size = "md" }: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <View style={[styles.container, size === "sm" && styles.containerSm]}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.segment,
              size === "sm" && styles.segmentSm,
              isActive && styles.segmentActive,
            ]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.label, size === "sm" && styles.labelSm, isActive && styles.labelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors, mode: ThemeMode) {
  return StyleSheet.create({
    container: {
      borderRadius: 999,
      backgroundColor: colors.pillBackground,
      padding: 4,
      flexDirection: "row",
    },
    containerSm: {
      padding: 2,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentSm: {
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    segmentActive: {
      backgroundColor: colors.pillBackgroundActive,
      shadowColor: mode === "dark" ? "rgba(0,0,0,0.6)" : "rgba(15,23,42,0.25)",
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    label: {
      fontWeight: "600",
      color: colors.pillText,
    },
    labelSm: {
      fontSize: 13,
    },
    labelActive: {
      color: colors.pillTextActive,
    },
  });
}
