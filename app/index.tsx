import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/features/auth/context/AuthContext";
import ListsScreen from "../src/features/planner/screens/ListsScreen";
import { useTheme } from "../src/theme/ThemeContext";

export default function Index() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <ListsScreen />;
}
