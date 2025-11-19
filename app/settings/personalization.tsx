import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/contexts/AuthContext";
import { useTheme } from "../../src/contexts/ThemeContext";
import type { ThemeColors } from "../../src/theme";

const NAV_SECTIONS = [
  {
    title: "User Settings",
    items: [
      { label: "Account Settings", route: "/settings/account" },
      { label: "Subscription", route: "/settings/subscription" },
    ],
  },
  {
    title: "App Settings",
    items: [
      { label: "Personalization", route: "/settings/personalization", active: true },
      { label: "Calendars", route: "/settings/calendars" },
    ],
  },
];

const APPEARANCE_OPTIONS = [
  { label: "Use system settings", value: "system" },
  { label: "Light mode", value: "light" },
  { label: "Dark mode", value: "dark" },
];

const SIDEBAR_LAYOUT_OPTIONS = [
  { label: "Show one list", value: "single" },
  { label: "Show all lists", value: "all" },
];

const NEW_TASK_POSITION_OPTIONS = [
  { label: "Top of list", value: "top" },
  { label: "Bottom of list", value: "bottom" },
];

const ROLLOVER_POSITION = [
  { label: "Top of list", value: "top" },
  { label: "Bottom of list", value: "bottom" },
];

type PersonalizationStyles = ReturnType<typeof createStyles>;
const PersonalizationStylesContext = createContext<PersonalizationStyles | null>(null);

function usePersonalizationStyles() {
  const value = useContext(PersonalizationStylesContext);
  if (!value) {
    throw new Error("Personalization styles missing");
  }
  return value;
}

export default function PersonalizationScreen() {
  const { session } = useAuth();
  const [sidebarLayout, setSidebarLayout] = useState("single");
  const [newTaskPosition, setNewTaskPosition] = useState("bottom");
  const [rolloverEnabled, setRolloverEnabled] = useState(true);
  const [rolloverPosition, setRolloverPosition] = useState("top");
  const [moveCompletedToBottom, setMoveCompletedToBottom] = useState(false);
  const [completeOnSubtasks, setCompleteOnSubtasks] = useState(false);
  const [autoActualTime, setAutoActualTime] = useState(false);
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const userName = useMemo(() => {
    const email = session?.user.email ?? "";
    const name =
      (session?.user.user_metadata?.full_name as string | undefined) ??
      (session?.user.user_metadata?.name as string | undefined) ??
      "";
    if (name) return name;
    if (email) return email.split("@")[0];
    return "You";
  }, [session]);

  const userEmail = session?.user.email ?? "demo@wonton.app";

  return (
    <PersonalizationStylesContext.Provider value={styles}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.screen}>
          <SettingsSidebar userName={userName} email={userEmail} />
          <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
            <Text style={styles.panelTitle}>Customize Ellie</Text>

            <SettingsCard title="Appearance">
              <OptionSelect
                label="Appearance"
                value={preference}
                onChange={setPreference}
                options={APPEARANCE_OPTIONS}
              />
            </SettingsCard>

            <SettingsCard title="Braindump & Lists">
              <OptionSelect
                label="Sidebar layout"
                value={sidebarLayout}
                onChange={setSidebarLayout}
                options={SIDEBAR_LAYOUT_OPTIONS}
              />
              <OptionSelect
                label="Add new tasks to the"
                value={newTaskPosition}
                onChange={setNewTaskPosition}
                options={NEW_TASK_POSITION_OPTIONS}
              />
            </SettingsCard>

            <SettingsCard title="Task Rollover">
              <ToggleRow
                label="Roll-over tasks to the next day"
                value={rolloverEnabled}
                onChange={setRolloverEnabled}
              />
              <OptionSelect
                label="Roll over tasks to the"
                value={rolloverPosition}
                onChange={setRolloverPosition}
                options={ROLLOVER_POSITION}
                disabled={!rolloverEnabled}
              />
            </SettingsCard>

            <SettingsCard title="After Task Completion">
              <ToggleRow
                label="Move tasks (and subtasks) to the bottom of the list on complete"
                value={moveCompletedToBottom}
                onChange={setMoveCompletedToBottom}
              />
              <ToggleRow
                label="Mark tasks as complete when subtasks are complete"
                value={completeOnSubtasks}
                onChange={setCompleteOnSubtasks}
              />
              <ToggleRow
                label='Automatically set "actual time" when task is complete'
                value={autoActualTime}
                onChange={setAutoActualTime}
              />
            </SettingsCard>
          </ScrollView>
        </View>
      </SafeAreaView>
    </PersonalizationStylesContext.Provider>
  );
}

function SettingsSidebar({ userName, email }: { userName: string; email: string }) {
  const initials = userName
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  const styles = usePersonalizationStyles();

  return (
    <View style={styles.sidebar}>
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || "U"}</Text>
        </View>
        <View>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userEmail}>{email}</Text>
        </View>
      </View>

      <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContent}>
        {NAV_SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={styles.navSectionLabel}>{section.title}</Text>
            {section.items.map((item) => (
              <Pressable
                key={item.label}
                style={[styles.navItem, item.active && styles.navItemActive]}
                onPress={() => {
                  if (item.active) return;
                  Alert.alert("Coming soon", `${item.label} is on the way.`);
                }}
              >
                <Text style={[styles.navItemText, item.active && styles.navItemTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  const styles = usePersonalizationStyles();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

type OptionSelectProps = {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

function OptionSelect({ label, value, options, onChange, disabled }: OptionSelectProps) {
  const [open, setOpen] = useState(false);
  const styles = usePersonalizationStyles();
  const { colors } = useTheme();
  const activeLabel = options.find((option) => option.value === value)?.label ?? "Select";

  return (
    <>
      <Pressable
        style={[styles.selectRow, disabled && styles.selectRowDisabled]}
        onPress={() => !disabled && setOpen(true)}
      >
        <Text style={styles.selectLabel}>{label}</Text>
        <View style={styles.selectValue}>
          <Text style={styles.selectValueText}>{activeLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.text} />
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.pickerLabel}>{label}</Text>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.pickerOption, selected && styles.pickerOptionActive]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextActive]}>
                    {option.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

type ToggleRowProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  const styles = usePersonalizationStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        thumbColor={colors.surface}
        trackColor={{ true: colors.accent, false: colors.borderMuted }}
      />
    </View>
  );
}
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.panelBackground,
    },
    screen: {
      flex: 1,
      flexDirection: "row",
    },
    sidebar: {
      width: 280,
      padding: 24,
      backgroundColor: colors.sidebarBackground,
      borderRightWidth: 1,
      borderColor: colors.divider,
    },
    userCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      marginBottom: 24,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accentMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontWeight: "700",
      color: colors.inverseText,
      fontSize: 18,
    },
    userName: {
      fontWeight: "700",
      color: colors.text,
      fontSize: 16,
    },
    userEmail: {
      color: colors.textMuted,
    },
    navScroll: {
      flex: 1,
    },
    navContent: {
      gap: 16,
    },
    navSectionLabel: {
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: colors.textMuted,
      marginBottom: 8,
    },
    navItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    navItemActive: {
      backgroundColor: colors.primary,
    },
    navItemText: {
      fontWeight: "600",
      color: colors.textSecondary,
    },
    navItemTextActive: {
      color: colors.primaryText,
    },
    panel: {
      flex: 1,
      paddingHorizontal: 32,
    },
    panelContent: {
      paddingVertical: 32,
      gap: 24,
    },
    panelTitle: {
      fontSize: 32,
      fontWeight: "700",
      color: colors.text,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 16,
    },
    cardBody: {
      gap: 12,
    },
    selectRow: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surfaceAlt,
    },
    selectRowDisabled: {
      opacity: 0.5,
    },
    selectLabel: {
      color: colors.textSecondary,
      fontWeight: "600",
    },
    selectValue: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    selectValueText: {
      fontWeight: "600",
      color: colors.text,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
    },
    toggleLabel: {
      flex: 1,
      color: colors.textSecondary,
      fontWeight: "600",
      marginRight: 12,
    },
    pickerBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    pickerCard: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 20,
      gap: 8,
    },
    pickerLabel: {
      fontWeight: "700",
      color: colors.text,
    },
    pickerOption: {
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    pickerOptionActive: {
      backgroundColor: colors.surfaceAlt,
    },
    pickerOptionText: {
      fontWeight: "600",
      color: colors.textSecondary,
    },
    pickerOptionTextActive: {
      color: colors.accent,
    },
  });
}
