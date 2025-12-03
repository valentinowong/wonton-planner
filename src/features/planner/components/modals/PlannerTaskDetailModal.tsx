import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
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
};

export function PlannerTaskDetailModal({ task, onClose, onDeleteTask }: PlannerTaskDetailModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const detailRef = useRef<TaskDetailViewHandle | null>(null);

  useEffect(() => {
    setHasChanges(false);
  }, [task?.id]);

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

  return (
    <Modal visible={Boolean(task)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.taskDetailModalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.taskDetailHeader}>
            <Text style={styles.taskDetailTitle}>Task Details</Text>
            <View style={styles.taskDetailActions}>
              <Pressable
                onPress={onClose}
                style={[styles.taskDetailActionButton, styles.taskDetailCancel]}
                disabled={saving || deleting}
              >
                <Text style={styles.taskDetailCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (saving || deleting) return;
                  setSaving(true);
                  try {
                    await detailRef.current?.savePendingFields();
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
                style={[
                  styles.taskDetailActionButton,
                  styles.taskDetailSave,
                  (saving || deleting || !hasChanges) && styles.taskDetailSaveDisabled,
                ]}
                disabled={saving || deleting || !hasChanges}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.primaryText} />
                ) : (
                  <Text style={styles.taskDetailSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
          {task ? (
            <TaskDetailView
              ref={detailRef}
              taskId={task.id}
              initialTask={task}
              onDirtyChange={setHasChanges}
              scrollStyle={styles.taskDetailScroll}
              contentStyle={styles.taskDetailContent}
            />
          ) : null}
          {task && onDeleteTask ? (
            <View style={styles.modalActions}>
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
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
