export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";
export type ThemeAccent = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export type ThemeColors = {
  background: string;
  sidebarBackground: string;
  panelBackground: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  border: string;
  borderMuted: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  inverseText: string;
  primary: string;
  primaryText: string;
  accent: string;
  accentMuted: string;
  success: string;
  successAlt: string;
  overlay: string;
  inputBackground: string;
  placeholder: string;
  dropZoneBackground: string;
  dropZoneBorder: string;
  scheduleCellBackground: string;
  scheduleCellBorder: string;
  divider: string;
  pillBackground: string;
  pillBackgroundActive: string;
  pillText: string;
  pillTextActive: string;
  danger: string;
  dangerText: string;
};

type ThemeShape = {
  mode: ThemeMode;
  colors: ThemeColors;
};

const lightColors: ThemeColors = {
  background: "#f8fafc",
  sidebarBackground: "#ffffff",
  panelBackground: "#f1f5f9",
  surface: "#ffffff",
  surfaceAlt: "#f3f4f6",
  surfaceElevated: "#e2e8f0",
  border: "#e2e8f0",
  borderMuted: "#cbd5f5",
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  inverseText: "#ffffff",
  primary: "#2563eb",
  primaryText: "#ffffff",
  accent: "#7c3aed",
  accentMuted: "#c4b5fd",
  success: "#22c55e",
  successAlt: "#4ade80",
  overlay: "rgba(15,15,30,0.4)",
  inputBackground: "#ffffff",
  placeholder: "#94a3b8",
  dropZoneBackground: "#e0e7ff",
  dropZoneBorder: "#c7d2fe",
  scheduleCellBackground: "#ffffff",
  scheduleCellBorder: "#e2e8f0",
  divider: "#e2e8f0",
  pillBackground: "#e2e8f0",
  pillBackgroundActive: "#ffffff",
  pillText: "#475569",
  pillTextActive: "#0f172a",
  danger: "#ef4444",
  dangerText: "#ffffff",
};

const darkColors: ThemeColors = {
  background: "#05050b",
  sidebarBackground: "#080812",
  panelBackground: "#0b0b13",
  surface: "#111118",
  surfaceAlt: "#15151e",
  surfaceElevated: "#1f1f2b",
  border: "#272739",
  borderMuted: "#1f1f2b",
  text: "#f4f4f5",
  textSecondary: "#cbd5f5",
  textMuted: "#9ca3af",
  inverseText: "#05050b",
  primary: "#4c8dff",
  primaryText: "#ffffff",
  accent: "#7c3aed",
  accentMuted: "#a78bfa",
  success: "#22c55e",
  successAlt: "#4ade80",
  overlay: "rgba(0,0,0,0.6)",
  inputBackground: "#111118",
  placeholder: "#6b7280",
  dropZoneBackground: "#1c1c2b",
  dropZoneBorder: "#2f2f41",
  scheduleCellBackground: "#1a1a26",
  scheduleCellBorder: "#1f1f2b",
  divider: "#1f1f2b",
  pillBackground: "#1f1f2b",
  pillBackgroundActive: "#111118",
  pillText: "#e4e4e7",
  pillTextActive: "#f8fafc",
  danger: "#f87171",
  dangerText: "#05050b",
};

export const themes: Record<ThemeMode, ThemeShape> = {
  light: { mode: "light", colors: lightColors },
  dark: { mode: "dark", colors: darkColors },
};

const accentPalettes: Record<ThemeAccent, { light: Partial<ThemeColors>; dark: Partial<ThemeColors> }> = {
  red: {
    light: { primary: "#ef4444", primaryText: "#ffffff", accent: "#ef4444", accentMuted: "#fecdd3" },
    dark: { primary: "#f87171", primaryText: "#05050b", accent: "#f87171", accentMuted: "#fca5a5" },
  },
  orange: {
    light: { primary: "#f97316", primaryText: "#ffffff", accent: "#f97316", accentMuted: "#fed7aa" },
    dark: { primary: "#fb923c", primaryText: "#05050b", accent: "#fb923c", accentMuted: "#fdba74" },
  },
  yellow: {
    light: { primary: "#f59e0b", primaryText: "#0f172a", accent: "#f59e0b", accentMuted: "#fef08a" },
    dark: { primary: "#facc15", primaryText: "#0f172a", accent: "#facc15", accentMuted: "#fef08a" },
  },
  green: {
    light: { primary: "#22c55e", primaryText: "#ffffff", accent: "#22c55e", accentMuted: "#bbf7d0" },
    dark: { primary: "#4ade80", primaryText: "#05050b", accent: "#4ade80", accentMuted: "#bbf7d0" },
  },
  blue: {
    light: { primary: "#2563eb", primaryText: "#ffffff", accent: "#2563eb", accentMuted: "#bfdbfe" },
    dark: { primary: "#4c8dff", primaryText: "#05050b", accent: "#4c8dff", accentMuted: "#bfdbfe" },
  },
  purple: {
    light: { primary: "#7c3aed", primaryText: "#ffffff", accent: "#7c3aed", accentMuted: "#ddd6fe" },
    dark: { primary: "#a78bfa", primaryText: "#05050b", accent: "#a78bfa", accentMuted: "#ddd6fe" },
  },
};

export function buildThemeColors(mode: ThemeMode, accent: ThemeAccent): ThemeColors {
  const base = themes[mode].colors;
  const overrides = accentPalettes[accent][mode];
  return { ...base, ...overrides };
}
