import { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider as PaperProvider } from "react-native-paper";
import { QueryProvider } from "./queryClient";
import { AuthProvider } from "../features/auth/context/AuthContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { ListsDrawerProvider } from "../features/planner/state/ListsDrawerContext";

/**
 * Central app providers wrapper so route layouts stay lean.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <PaperProvider>
              <ListsDrawerProvider>{children}</ListsDrawerProvider>
            </PaperProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}
