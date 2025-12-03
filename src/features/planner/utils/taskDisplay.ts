import type { LocalTask } from "../../../data/local/db";

export function formatTaskStartTime(task: LocalTask) {
  if (!task.planned_start) return null;
  const date = new Date(task.planned_start);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(minutes: number) {
  if (!minutes || Number.isNaN(minutes)) return null;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}
