import type { LocalTask } from "../../../data/local/db";

/**
 * Returns true when the task is unassigned or assigned to someone other than the active user.
 */
export function isOtherOrUnassigned(task: Pick<LocalTask, "assignee_id">, currentUserId: string | null): boolean {
  if (!currentUserId) return true;
  return !task.assignee_id || task.assignee_id !== currentUserId;
}
