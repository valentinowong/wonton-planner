import type { LocalTask } from "../../../data/local/db";

export function getTaskTimeMetrics(task: LocalTask) {
  if (!task.planned_start) return null;
  const startDate = new Date(task.planned_start);
  if (Number.isNaN(startDate.getTime())) return null;
  const endDate = task.planned_end ? new Date(task.planned_end) : new Date(startDate.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(endDate.getTime())) return null;
  let startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  let endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
  if (endMinutes <= startMinutes) {
    endMinutes = startMinutes + 60;
  }
  startMinutes = Math.max(0, Math.min(24 * 60, startMinutes));
  endMinutes = Math.max(startMinutes + 15, Math.min(24 * 60, endMinutes));
  return {
    startMinutes,
    durationMinutes: endMinutes - startMinutes,
  };
}
