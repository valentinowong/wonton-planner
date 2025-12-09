import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TaskDetailView, type TaskDetailViewHandle } from "../../../../components/data-display/TaskDetailView";
import { queueTaskDeletion } from "../../../../data/sync";
import type { LocalTask } from "../../../../data/local/db";
import { useTheme } from "../../../../theme/ThemeContext";
import { usePlannerStyles } from "../../state/PlannerStylesContext";

export type PlannerTaskDetailModalProps = {
  task: LocalTask | null;
  onClose: () => void;
  onDeleteTask?: (taskId: string) => void | Promise<void>;
  onShowToast?: (message: string, variant?: "success" | "error") => void;
};

export function PlannerTaskDetailModal({ task, onClose, onDeleteTask, onShowToast }: PlannerTaskDetailModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [scopeLabel, setScopeLabel] = useState("This task");
  const [status, setStatus] = useState<LocalTask["status"] | null>(task?.status ?? null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const detailRef = useRef<TaskDetailViewHandle | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerTitleRef = useRef<TextInput | null>(null);

  useEffect(() => {
    setHasChanges(false);
    setSaveError(null);
    setJustSaved(false);
    setScopeLabel("This task");
    setStatus(task?.status ?? null);
    setTitle(task?.title ?? "");
    setEditingTitle(false);
  }, [task?.id, task?.status, task?.title]);

  useEffect(() => {
    if (hasChanges) {
      setJustSaved(false);
    }
  }, [hasChanges]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const handleDelete = useCallback(async () => {
    if (!task?.id || deleting) return;
    try {
      setDeleting(true);
      if (onDeleteTask) {
        await onDeleteTask(task.id);
      } else {
        await queueTaskDeletion(task.id);
      }
      onClose();
    } finally {
      setDeleting(false);
    }
  }, [deleting, onClose, onDeleteTask, task]);

  const handleSave = useCallback(async () => {
    if (saving || deleting || detaching) return;
    setSaveError(null);
    setSaving(true);
    try {
      await detailRef.current?.savePendingFields();
      setHasChanges(false);
      setJustSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 1500);
      onShowToast?.("Changes saved", "success");
      onClose();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Could not save changes.";
      setSaveError(message);
      setHasChanges(true);
    } finally {
      setSaving(false);
    }
  }, [deleting, detaching, onClose, onShowToast, saving]);

  const handleDetach = useCallback(async () => {
    if (detaching) return;
    setSaveError(null);
    setDetaching(true);
    try {
      await detailRef.current?.detachOccurrence();
      onShowToast?.("Detached to a standalone task", "success");
      onClose();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Could not detach occurrence.";
      setSaveError(message);
      setHasChanges(true);
    } finally {
      setDetaching(false);
    }
  }, [detaching, onClose, onShowToast]);

  const handleToggleStatus = useCallback(() => {
    const next = detailRef.current?.toggleStatus();
    if (next) {
      setStatus(next);
    }
  }, []);

  return (
    <Modal visible={Boolean(task)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.taskDetailModalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.taskDetailHeader}>
            <Pressable
              onPress={handleToggleStatus}
              style={[
                styles.taskDetailStatusToggleRow,
                (saving || deleting || detaching) && styles.taskDetailStatusToggleDisabled,
              ]}
              disabled={saving || deleting || detaching}
              accessibilityLabel={status === "done" ? "Mark todo" : "Mark done"}
            >
              <View
                style={[
                  styles.taskDetailStatusToggle,
                  status === "done" && styles.taskDetailStatusToggleDone,
                ]}
              >
                {status === "done" ? <Ionicons name="checkmark" size={16} color={colors.surface} /> : null}
              </View>
            </Pressable>
            <View style={styles.taskDetailTitleWrap}>
              {editingTitle ? (
                <TextInput
                  ref={headerTitleRef}
                  style={[
                    styles.taskDetailTitleInput,
                    status === "done" && styles.taskDetailTitleDone,
                  ]}
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    detailRef.current?.setTitleFromHeader(value);
                  }}
                  onBlur={() => setEditingTitle(false)}
                  autoFocus
                  placeholder="Untitled task"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setEditingTitle(true);
                    requestAnimationFrame(() => headerTitleRef.current?.focus());
                  }}
                  hitSlop={6}
                >
                  <Text
                    style={[
                      styles.taskDetailTitle,
                      status === "done" && styles.taskDetailTitleDone,
                    ]}
                    numberOfLines={2}
                  >
                    {title?.trim() ? title : "Untitled task"}
                  </Text>
                </Pressable>
              )}
              <View style={styles.taskDetailStatusRow}>
                {hasChanges ? (
                  <View style={[styles.taskDetailStatusPill, styles.taskDetailStatusUnsaved]}>
                    <Ionicons name="time-outline" size={14} color={colors.accent} />
                    <Text style={styles.taskDetailStatusText}>Unsaved changes</Text>
                  </View>
                ) : null}
                {!hasChanges && justSaved ? (
                  <View style={[styles.taskDetailStatusPill, styles.taskDetailStatusSaved]}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                    <Text style={styles.taskDetailStatusText}>Saved</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          {saveError ? (
            <View style={styles.taskDetailErrorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.taskDetailErrorText}>{saveError}</Text>
            </View>
          ) : null}
          {task ? (
            <TaskDetailView
              ref={detailRef}
              taskId={task.id}
              initialTask={task}
              onDirtyChange={setHasChanges}
              onScopeChange={(scope, hasRecurrence) => {
                if (!hasRecurrence) {
                  setScopeLabel("This task");
                  return;
                }
                setScopeLabel(scope === "occurrence" ? "This occurrence" : "Entire series");
              }}
              scrollStyle={styles.taskDetailScroll}
              contentStyle={styles.taskDetailContent}
              onStatusChange={(next) => setStatus(next)}
              onTitleChange={(next) => setTitle(next)}
            />
          ) : null}
          {task?.is_recurring && task?.recurrence_id && task?.occurrence_date ? (
            <View style={styles.taskDetailInlineActions}>
              <Pressable
                style={[styles.taskDetailDetachButton, detaching && styles.taskDetailDetachDisabled]}
                onPress={handleDetach}
              >
                <Ionicons
                  name="unlink"
                  size={16}
                  color={detaching ? colors.textMuted : colors.textSecondary}
                  style={styles.taskDetailDetachIcon}
                />
                <Text style={styles.taskDetailDetachText}>
                  {detaching ? "Detaching…" : "Detach this occurrence"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {task ? (
            <View style={styles.taskDetailFooter}>
              {onDeleteTask ? (
                <Pressable
                  style={[styles.modalDangerButton, deleting && styles.modalDangerDisabled]}
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
              ) : (
                <View style={styles.taskDetailFooterSpacer} />
              )}
              <View style={styles.taskDetailActions}>
                <Pressable
                  onPress={onClose}
                  style={[styles.taskDetailActionButton, styles.taskDetailCancel]}
                  disabled={saving || deleting || detaching}
                >
                  <Text style={styles.taskDetailCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  style={[
                    styles.taskDetailActionButton,
                    styles.taskDetailSave,
                    (saving || deleting || detaching || !hasChanges) && styles.taskDetailSaveDisabled,
                  ]}
                  disabled={saving || deleting || detaching || !hasChanges}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.primaryText} />
                  ) : (
                    <View style={styles.taskDetailSaveLabel}>
                      <Text style={styles.taskDetailSaveText}>Save changes</Text>
                      <Text style={styles.taskDetailSaveSubtext}>Applies to: {scopeLabel}</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
