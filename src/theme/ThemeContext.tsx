import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { themes, type ThemeColors, type ThemeMode, type ThemePreference } from "../theme";

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  colors: ThemeColors;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? "light";
  const [preference, setPreference] = useState<ThemePreference>("system");
  const mode = preference === "system" ? (systemScheme as ThemeMode) : preference;
  const colors = themes[mode].colors;

  const value = useMemo(
    () => ({
      mode,
      preference,
      colors,
      setPreference,
    }),
    [mode, preference, colors],
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
