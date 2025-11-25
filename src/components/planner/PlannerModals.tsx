import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SegmentedControl } from "../SegmentedControl";
import { TaskDetailView } from "../TaskDetailView";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import type { RemoteList } from "../../hooks/useLists";
import { usePlannerStyles } from "./PlannerStylesContext";
import type { DeleteAction } from "./types";
import { queueTaskDeletion } from "../../lib/sync";

type PlannerCreateListModalProps = {
  visible: boolean;
  value: string;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
};

export function PlannerCreateListModal({ visible, value, onChangeValue, onClose, onSubmit, loading }: PlannerCreateListModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>New List</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="List name"
            placeholderTextColor={colors.placeholder}
            value={value}
            onChangeText={onChangeValue}
            autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.modalGhostButton}>
              <Text style={styles.modalGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalPrimaryButton, (!value.trim() || loading) && styles.modalPrimaryDisabled]} disabled={!value.trim() || loading} onPress={onSubmit}>
              {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.modalPrimaryText}>Create</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type PlannerDeleteListModalProps = {
  visible: boolean;
  list: RemoteList | null;
  taskCount: number | null;
  checkingTasks: boolean;
  submitting: boolean;
  inboxList: RemoteList | null;
  lists: RemoteList[];
  onClose: () => void;
  onConfirm: (action: DeleteAction, targetListId?: string | null) => void;
};

export function PlannerDeleteListModal({
  visible,
  list,
  taskCount,
  checkingTasks,
  submitting,
  inboxList,
  lists,
  onClose,
  onConfirm,
}: PlannerDeleteListModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  const [action, setAction] = useState<DeleteAction>("delete");
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);

  useEffect(() => {
    setAction("delete");
    setMoveTargetId(null);
  }, [visible, list?.id]);

  if (!list) return null;

  const listName = list.name ?? "Untitled list";
  const hasTasks = (taskCount ?? 0) > 0;
  const availableTargets = lists.filter((candidate) => candidate.id !== list.id && candidate.id !== inboxList?.id);
  const inboxDisabled = !inboxList || inboxList.id === list.id;
  const otherDisabled = availableTargets.length === 0;

  function selectAction(next: DeleteAction) {
    setAction(next);
    if (next === "move_other") {
      setMoveTargetId((current) => current ?? availableTargets[0]?.id ?? null);
    } else {
      setMoveTargetId(null);
    }
  }

  const confirmDisabled =
    checkingTasks ||
    submitting ||
    (hasTasks && action === "move_other" && (otherDisabled || !moveTargetId)) ||
    (hasTasks && action === "move_inbox" && inboxDisabled);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.modalTitle}>{`Delete “${listName}”`}</Text>
          {checkingTasks ? (
            <View style={styles.deleteListStatus}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.deleteListDescription}>Checking tasks in this list…</Text>
            </View>
          ) : hasTasks ? (
            <>
              <Text style={styles.deleteListDescription}>
                This list contains {taskCount} task{taskCount === 1 ? "" : "s"}. Choose what to do with them before deleting the list.
              </Text>
              <View style={styles.deleteOptionGroup}>
                <Pressable style={styles.deleteOptionRow} onPress={() => selectAction("delete")}>
                  <Ionicons name={action === "delete" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.text} />
                  <View style={styles.deleteOptionLabels}>
                    <Text style={styles.deleteOptionTitle}>Delete the tasks</Text>
                    <Text style={styles.deleteOptionSubtitle}>Remove every task in this list forever.</Text>
                  </View>
                </Pressable>
                <Pressable style={[styles.deleteOptionRow, inboxDisabled && styles.deleteOptionDisabled]} onPress={() => !inboxDisabled && selectAction("move_inbox")}>
                  <Ionicons name={action === "move_inbox" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.text} />
                  <View style={styles.deleteOptionLabels}>
                    <Text style={styles.deleteOptionTitle}>Move tasks to Inbox</Text>
                    <Text style={styles.deleteOptionSubtitle}>Keep everything and move it to Inbox.</Text>
                  </View>
                </Pressable>
                <Pressable style={[styles.deleteOptionRow, otherDisabled && styles.deleteOptionDisabled]} onPress={() => !otherDisabled && selectAction("move_other")}>
                  <Ionicons name={action === "move_other" ? "radio-button-on" : "radio-button-off"} size={18} color={colors.text} />
                  <View style={styles.deleteOptionLabels}>
                    <Text style={styles.deleteOptionTitle}>Move tasks to another list</Text>
                    <Text style={styles.deleteOptionSubtitle}>Choose another list to keep these tasks.</Text>
                  </View>
                </Pressable>
              </View>
              {action === "move_other" && !otherDisabled ? (
                <View style={styles.moveListPicker}>
                  {availableTargets.map((target) => {
                    const selected = moveTargetId === target.id;
                    return (
                      <Pressable
                        key={target.id}
                        style={[styles.moveListOption, selected && styles.moveListOptionActive]}
                        onPress={() => setMoveTargetId(target.id)}
                      >
                        <Text style={[styles.moveListOptionText, selected && styles.moveListOptionTextActive]}>
                          {target.name ?? "Untitled"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.deleteListDescription}>Are you sure you want to delete this list? This action cannot be undone.</Text>
          )}
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.modalGhostButton} disabled={submitting}>
              <Text style={styles.modalGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(action, moveTargetId)}
              style={[styles.modalPrimaryButton, (confirmDisabled || submitting) && styles.modalPrimaryDisabled]}
              disabled={confirmDisabled || submitting}
            >
              {submitting ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.modalPrimaryText}>Delete list</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type PlannerSettingsModalProps = {
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
  const { colors, preference, setPreference } = useTheme();
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
                {signingOut ? <ActivityIndicator size="small" color={colors.dangerText} /> : <Text style={styles.settingsSignOutText}>Sign Out</Text>}
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
                          thumbColor={colors.surface}
                          trackColor={{ true: colors.accent, false: colors.borderMuted }}
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
                          thumbColor={colors.surface}
                          trackColor={{ true: colors.accent, false: colors.borderMuted }}
                        />
                      </View>
                      <View style={styles.settingsSwitchRow}>
                        <Text style={styles.settingsSwitchLabel}>Mark tasks as complete when subtasks are complete</Text>
                        <Switch
                          value={completeOnSubtasks}
                          onValueChange={setCompleteOnSubtasks}
                          thumbColor={colors.surface}
                          trackColor={{ true: colors.accent, false: colors.borderMuted }}
                        />
                      </View>
                      <View style={styles.settingsSwitchRow}>
                        <Text style={styles.settingsSwitchLabel}>Automatically set “actual time” when task is complete</Text>
                        <Switch
                          value={autoActualTime}
                          onValueChange={setAutoActualTime}
                          thumbColor={colors.surface}
                          trackColor={{ true: colors.accent, false: colors.borderMuted }}
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

type PlannerTaskDetailModalProps = {
  taskId: string | null;
  onClose: () => void;
  onDeleteTask?: (taskId: string) => void | Promise<void>;
};

export function PlannerTaskDetailModal({ taskId, onClose, onDeleteTask }: PlannerTaskDetailModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!taskId || deleting) return;
    try {
      setDeleting(true);
      if (onDeleteTask) {
        await onDeleteTask(taskId);
      } else {
        await queueTaskDeletion(taskId);
      }
      onClose();
    } finally {
      setDeleting(false);
    }
  }, [deleting, onClose, onDeleteTask, taskId]);

  return (
    <Modal visible={Boolean(taskId)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.taskDetailModalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.taskDetailHeader}>
            <Text style={styles.taskDetailTitle}>Task Details</Text>
            <Pressable onPress={onClose} style={styles.taskDetailClose}>
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>
          {taskId ? (
            <TaskDetailView taskId={taskId} scrollStyle={styles.taskDetailScroll} contentStyle={styles.taskDetailContent} />
          ) : null}
          {taskId && onDeleteTask ? (
            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.modalDangerButton,
                  deleting && styles.modalDangerDisabled,
                ]}
                disabled={deleting}
                onPress={handleDelete}
              >
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={deleting ? colors.textMuted : colors.danger}
                  style={styles.modalDangerIcon}
                />
                <Text style={styles.modalDangerText}>{deleting ? "Deleting…" : "Delete task"}</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
