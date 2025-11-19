import { Stack } from "expo-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { pushOutbox, subscribeToRealtime } from "../src/lib/sync";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext";
import { QueryProvider } from "../src/lib/queryClient";

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

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/sign-in" options={{ title: "Sign In" }} />
        <Stack.Screen name="(auth)/sign-up" options={{ title: "Create Account" }} />
      </Stack>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
      <Stack.Screen name="task/[id]" options={{ title: "Task", presentation: "modal" }} />
      <Stack.Screen name="recurrence/new" options={{ title: "New Recurrence" }} />
      <Stack.Screen name="recurrence/[id]" options={{ title: "Edit Recurrence" }} />
      <Stack.Screen name="settings/personalization" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <AppSyncBridge />
          <Navigator />
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
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
