export const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export const DAY_COLUMN_WIDTH = 260;
export const HOUR_BLOCK_HEIGHT = 64;
export const CALENDAR_DAY_WIDTH = 160;

export function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalized} ${suffix}`;
}
