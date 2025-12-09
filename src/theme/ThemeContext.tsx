import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildThemeColors, type ThemeAccent, type ThemeColors, type ThemeMode, type ThemePreference } from "../theme";

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  colors: ThemeColors;
  setPreference: (value: ThemePreference) => void;
  accent: ThemeAccent;
  setAccent: (value: ThemeAccent) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_PREFERENCE_KEY = "theme:preference";
const STORAGE_ACCENT_KEY = "theme:accent";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? "light";
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [accent, setAccent] = useState<ThemeAccent>("purple");
  const mode = preference === "system" ? (systemScheme as ThemeMode) : preference;
  const colors = buildThemeColors(mode, accent);

  // hydrate saved preference/accent on mount
  useEffect(() => {
    (async () => {
      try {
        const [storedPref, storedAccent] = await Promise.all([
          AsyncStorage.getItem(STORAGE_PREFERENCE_KEY),
          AsyncStorage.getItem(STORAGE_ACCENT_KEY),
        ]);
        if (storedPref === "light" || storedPref === "dark" || storedPref === "system") {
          setPreference(storedPref);
        }
        if (storedAccent === "red" || storedAccent === "orange" || storedAccent === "yellow" || storedAccent === "green" || storedAccent === "blue" || storedAccent === "purple") {
          setAccent(storedAccent);
        }
      } catch {
        // ignore hydration errors
      }
    })();
  }, []);

  // persist updates
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_PREFERENCE_KEY, preference).catch(() => {});
  }, [preference]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_ACCENT_KEY, accent).catch(() => {});
  }, [accent]);

  const value = useMemo(
    () => ({
      mode,
      preference,
      colors,
      setPreference,
      accent,
      setAccent,
    }),
    [mode, preference, colors, accent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
