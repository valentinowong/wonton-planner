import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View, Platform } from "react-native";
import { SegmentedControl } from "../../../../components/ui/SegmentedControl";
import { useAuth } from "../../../auth/context/AuthContext";
import { useTheme } from "../../../../theme/ThemeContext";
import type { ThemeAccent } from "../../../../theme";
import { usePlannerStyles } from "../../state/PlannerStylesContext";

export type PlannerSettingsModalProps = {
  visible: boolean;
  onClose: () => void;
  userEmail: string;
  calendarStart: "sunday" | "monday";
  onChangeCalendarStart: (value: "sunday" | "monday") => void;
};

export function PlannerSettingsModal({
  visible,
  onClose,
  userEmail,
  calendarStart,
  onChangeCalendarStart,
}: PlannerSettingsModalProps) {
  const { signOut, session } = useAuth();
  const displayName =
    (session?.user.user_metadata?.display_name as string | undefined) ??
    (session?.user.user_metadata?.full_name as string | undefined) ??
    (session?.user.user_metadata?.name as string | undefined) ??
    "";
  const headerLabel = displayName || userEmail || "You";
  const initials = headerLabel
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  const menuItems = [
    { key: "account", label: "Account Settings" },
    { key: "app", label: "App Settings" },
  ] as const;
  const styles = usePlannerStyles();
  const { colors, preference, setPreference, accent, setAccent, mode } = useTheme();
  const [activeSection, setActiveSection] = useState<"account" | "app">("account");
  const [displayNameInput, setDisplayNameInput] = useState(displayName);
  const [emailInput, setEmailInput] = useState(userEmail);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarLayout, setSidebarLayout] = useState<"single" | "all">("single");
  const [newTaskPosition, setNewTaskPosition] = useState<"top" | "bottom">("bottom");
  const [rolloverEnabled, setRolloverEnabled] = useState(true);
  const [rolloverPosition, setRolloverPosition] = useState<"top" | "bottom">("top");
  const [moveCompletedToBottom, setMoveCompletedToBottom] = useState(false);
  const [completeOnSubtasks, setCompleteOnSubtasks] = useState(false);
  const [autoActualTime, setAutoActualTime] = useState(false);

  useEffect(() => {
    setDisplayNameInput(displayName);
    setEmailInput(userEmail);
  }, [displayName, userEmail]);

  async function handleSignOut() {
    if (signingOut) return;
    try {
      setSigningOut(true);
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Unable to sign out", message);
    } finally {
      setSigningOut(false);
    }
  }

  function handleSaveAccount() {
    Alert.alert("Saved", "Account settings updated.");
  }

  function handleSaveApp() {
    Alert.alert("Saved", "App preferences updated.");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.settingsModalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.settingsModalShell}>
            <View style={styles.settingsSidebar}>
              <View style={styles.settingsHeader}>
                <View style={styles.settingsHeaderInfo}>
                  <View style={styles.settingsAvatar}>
                    <Text style={styles.settingsAvatarText}>{initials || "U"}</Text>
                  </View>
                  <View>
                    <Text style={styles.settingsUserName}>{displayName || userEmail}</Text>
                    <Text style={styles.settingsUserEmail}>{userEmail}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.settingsMenu}>
                {menuItems.map((item) => {
                  const active = activeSection === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      style={[styles.settingsMenuItem, active && styles.settingsMenuItemActive]}
                      onPress={() => setActiveSection(item.key)}
                    >
                      <Text style={[styles.settingsMenuItemText, active && styles.settingsMenuItemTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                style={[styles.settingsSignOutButton, signingOut && styles.settingsSignOutButtonDisabled]}
                onPress={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator size="small" color={colors.dangerText} />
                ) : (
                  <Text style={styles.settingsSignOutText}>Sign Out</Text>
                )}
              </Pressable>
            </View>
            <View style={styles.settingsContent}>
              <ScrollView
                style={styles.settingsModalScroll}
                contentContainerStyle={styles.settingsModalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {activeSection === "account" ? (
                  <>
                    <Text style={styles.settingsPanelTitle}>Account Settings</Text>
                    <View style={styles.settingsCard}>
                      <Text style={styles.settingsCardTitle}>Profile</Text>
                      <View style={styles.settingsFormGroup}>
                        <Text style={styles.settingsLabel}>Display name</Text>
                        <TextInput
                          style={styles.settingsInput}
                          placeholder="Add a display name"
                          placeholderTextColor={colors.placeholder}
                          value={displayNameInput}
                          onChangeText={setDisplayNameInput}
                        />
                      </View>
                      <View style={styles.settingsFormGroup}>
                        <Text style={styles.settingsLabel}>Email</Text>
                        <TextInput
                          style={styles.settingsInput}
                          placeholder="Enter your email"
                          placeholderTextColor={colors.placeholder}
                          value={emailInput}
                          onChangeText={setEmailInput}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                    </View>

                    <View style={styles.settingsCard}>
                      <Text style={styles.settingsCardTitle}>Security</Text>
                      <View style={styles.settingsFormGroup}>
                        <Text style={styles.settingsLabel}>New password</Text>
                        <TextInput
                          style={styles.settingsInput}
                          placeholder="Create a new password"
                          placeholderTextColor={colors.placeholder}
                          value={passwordInput}
                          onChangeText={setPasswordInput}
                          secureTextEntry
                        />
                      </View>
                      <View style={styles.settingsFormGroup}>
                        <Text style={styles.settingsLabel}>Confirm password</Text>
                        <TextInput
                          style={styles.settingsInput}
                          placeholder="Re-enter your password"
                          placeholderTextColor={colors.placeholder}
                          value={confirmPasswordInput}
                          onChangeText={setConfirmPasswordInput}
                          secureTextEntry
                        />
                      </View>
                    </View>

                    <View style={styles.modalActions}>
                      <Pressable style={styles.modalPrimaryButton} onPress={handleSaveAccount}>
                        <Text style={styles.modalPrimaryText}>Save account changes</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.settingsPanelTitle}>App Settings</Text>
                    <View style={styles.settingsCard}>
                      <Text style={styles.settingsCardTitle}>Appearance</Text>
                      <SegmentedControl
                        size="sm"
                        value={preference}
                        options={[
                          { label: "System", value: "system" },
                          { label: "Light", value: "light" },
                          { label: "Dark", value: "dark" },
                        ]}
                        onChange={(next) => setPreference(next as typeof preference)}
                      />
                      <View style={styles.settingsFormGroup}>
                        <Text style={styles.settingsLabel}>Accent color</Text>
                        <SegmentedControl
                          size="sm"
                          value={accent}
                          options={[
                            { label: "Red", value: "red" },
                            { label: "Orange", value: "orange" },
                            { label: "Yellow", value: "yellow" },
                            { label: "Green", value: "green" },
                            { label: "Blue", value: "blue" },
                            { label: "Purple", value: "purple" },
                          ]}
                          onChange={(next) => setAccent(next as ThemeAccent)}
                        />
                      </View>
                    </View>
                    <View style={styles.settingsCard}>
                      <Text style={styles.settingsCardTitle}>Inbox & Lists</Text>
                      <View style={styles.settingsRow}>
                        <Text style={styles.settingsLabel}>Add new tasks to the</Text>
                        <SegmentedControl
                          size="sm"
                          value={newTaskPosition}
                          options={[
                            { label: "Top", value: "top" },
                            { label: "Bottom", value: "bottom" },
                          ]}
                          onChange={(next) => setNewTaskPosition(next as typeof newTaskPosition)}
                        />
                      </View>
                    </View>
                    <View style={styles.settingsCard}>
                      <Text style={styles.settingsCardTitle}>Task Rollover</Text>
                      <View style={styles.settingsSwitchRow}>
                        <Text style={styles.settingsSwitchLabel}>Roll-over tasks to the next day</Text>
                        <Switch
                          value={rolloverEnabled}
                          onValueChange={setRolloverEnabled}
                          {...getSwitchColors({ value: rolloverEnabled, colors, mode })}
                        />
                      </View>
                      <View style={[styles.settingsRow, !rolloverEnabled && styles.settingsRowDisabled]}>
                        <Text style={styles.settingsLabel}>Roll over tasks to the</Text>
                        <SegmentedControl
                          size="sm"
                          value={rolloverPosition}
                          options={[
                            { label: "Top", value: "top" },
                            { label: "Bottom", value: "bottom" },
                          ]}
                          onChange={(next) => setRolloverPosition(next as typeof rolloverPosition)}
                        />
                      </View>
                    </View>
                    <View style={styles.settingsCard}>
                      <Text style={styles.settingsCardTitle}>After Task Completion</Text>
                      <View style={styles.settingsSwitchRow}>
                        <Text style={styles.settingsSwitchLabel}>
                          Move tasks (and subtasks) to the bottom of the list on complete
                        </Text>
                        <Switch
                          value={moveCompletedToBottom}
                          onValueChange={setMoveCompletedToBottom}
                          {...getSwitchColors({ value: moveCompletedToBottom, colors, mode })}
                        />
                      </View>
                      <View style={styles.settingsSwitchRow}>
                        <Text style={styles.settingsSwitchLabel}>Mark tasks as complete when subtasks are complete</Text>
                        <Switch
                          value={completeOnSubtasks}
                          onValueChange={setCompleteOnSubtasks}
                          {...getSwitchColors({ value: completeOnSubtasks, colors, mode })}
                        />
                      </View>
                      <View style={styles.settingsSwitchRow}>
                        <Text style={styles.settingsSwitchLabel}>Automatically set “actual time” when task is complete</Text>
                        <Switch
                          value={autoActualTime}
                          onValueChange={setAutoActualTime}
                          {...getSwitchColors({ value: autoActualTime, colors, mode })}
                        />
                      </View>
                    </View>
                    <View style={styles.settingsCard}>
                      <Text style={styles.settingsCardTitle}>Calendar</Text>
                      <Text style={styles.settingsLabel}>Start the week on</Text>
                      <SegmentedControl
                        size="sm"
                        value={calendarStart}
                        options={[
                          { label: "Sunday", value: "sunday" },
                          { label: "Monday", value: "monday" },
                        ]}
                        onChange={(next) => onChangeCalendarStart(next as typeof calendarStart)}
                      />
                    </View>
                    <View style={styles.modalActions}>
                      <Pressable style={styles.modalPrimaryButton} onPress={handleSaveApp}>
                        <Text style={styles.modalPrimaryText}>Save app preferences</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function accentTrackColor(primary: string, mode: "light" | "dark") {
  const alpha = mode === "dark" ? 0.4 : 0.35;
  const normalized = primary.replace("#", "");
  if (normalized.length !== 6) return primary;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSwitchColors({
  value,
  colors,
  mode,
}: {
  value: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  mode: "light" | "dark";
}) {
  const trackOn = accentTrackColor(colors.primary, mode);
  const trackOff = colors.borderMuted;
  const thumbOn = colors.primary;
  const thumbOff = colors.surface;

  if (Platform.OS === "web") {
    return {
      thumbColor: value ? thumbOn : trackOff,
      trackColor: { false: trackOff, true: trackOn },
      activeThumbColor: thumbOn,
      activeTrackColor: trackOn,
    };
  }

  return {
    thumbColor: value ? thumbOn : thumbOff,
    trackColor: { false: trackOff, true: trackOn },
    ios_backgroundColor: trackOff,
  };
}
