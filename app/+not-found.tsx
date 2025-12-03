import { Link } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../src/theme/ThemeContext";

export default function NotFound() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text }}>Page not found</Text>
      <Text style={{ marginTop: 8, marginBottom: 16, color: colors.textMuted }}>The page you’re looking for doesn’t exist.</Text>
      <Link href="/" asChild>
        <Pressable style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary }}>
          <Text style={{ color: colors.primaryText, fontWeight: "600" }}>Go home</Text>
        </Pressable>
      </Link>
    </View>
  );
}
