import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppProviders } from "../src/core/providers";
import { pushOutbox, subscribeToRealtime } from "../src/data/sync";
import { useAuth } from "../src/features/auth/context/AuthContext";
import { useTheme } from "../src/theme/ThemeContext";

function AppSyncBridge() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return undefined;
    const unsubscribe = subscribeToRealtime(queryClient);
    return () => unsubscribe();
  }, [queryClient, session]);

  useEffect(() => {
    if (!session) return undefined;
    const interval = setInterval(() => {
      pushOutbox().catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [session]);

  return null;
}

function Navigator() {
  const { session, loading } = useAuth();
  const { colors } = useTheme();
  const isLoggedIn = Boolean(session);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="(auth)/sign-in" options={{ title: "Sign In" }} />
        <Stack.Screen name="(auth)/sign-up" options={{ title: "Create Account" }} />
      </Stack.Protected>

      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <AppSyncBridge />
      <Navigator />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
