// Dates are "YYYY-MM-DD" strings with no timezone. "Today" is the date on this device, which is
// what the API expects too. The math runs in UTC so adding days never trips over daylight saving.
import type { Repeat } from "./chores.api.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date on this device */
export function today(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The date `every` days or weeks after `date`. Must match the API's rule. */
export function addInterval(date: string, { every, unit }: Repeat): string {
  const days = unit === "week" ? every * 7 : every;
  return new Date(parseDate(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`: negative when `to` is earlier */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

function parseDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

const weekday = new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "Friday" within the next week, "Nov 14" further out */
export function formatDate(date: string, from: string): string {
  const days = daysBetween(from, date);
  const time = parseDate(date);
  return days > 0 && days < 7 ? weekday.format(time) : shortDate.format(time);
}

export type DueGroup = "overdue" | "today" | "week" | "later" | "anytime";

export const DUE_GROUPS: { group: DueGroup; label: string }[] = [
  { group: "overdue", label: "Overdue" },
  { group: "today", label: "Today" },
  { group: "week", label: "This week" },
  { group: "later", label: "Later" },
  { group: "anytime", label: "Anytime" },
];

export function dueGroup(dueOn: string | null, on: string): DueGroup {
  if (!dueOn) return "anytime";
  const days = daysBetween(on, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days < 7 ? "week" : "later";
}

/** "Due today", "2 days overdue", "Due Friday", "Due Nov 14" */
export function dueLabel(dueOn: string, on: string): string {
  const days = daysBetween(on, dueOn);
  if (days < 0) return days === -1 ? "1 day overdue" : `${-days} days overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${formatDate(dueOn, on)}`;
}

/** "Every day", "Every 3 days", "Every week", "Every 2 weeks" */
export function repeatLabel({ every, unit }: Repeat): string {
  if (every === 1) return unit === "week" ? "Every week" : "Every day";
  return `Every ${every} ${unit}s`;
}

/** "today", "yesterday", "3 days ago", "Oct 14" */
export function pastDateLabel(date: string, on: string): string {
  const days = daysBetween(date, on);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate.format(parseDate(date));
}
