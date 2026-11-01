// Calendar-day helpers shared by features that have due dates. Dates arrive from the API as
// "YYYY-MM-DD" strings and are worked on as Temporal.PlainDates: no time or time zone.
// "Today" is the date on this device, which is what the API expects too.

/** Today's date on this device */
export function today(): string {
  return Temporal.Now.plainDateISO().toString();
}

/** Whole days from `from` to `to`: negative when `to` is earlier */
export function daysBetween(from: string, to: string): number {
  return Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to), { largestUnit: "days" })
    .days;
}

/** "Friday" within the next week, "Nov 14" further out */
export function formatDate(date: string, from: string): string {
  const days = daysBetween(from, date);
  return Temporal.PlainDate.from(date).toLocaleString(
    "en",
    days > 0 && days < 7 ? { weekday: "long" } : { day: "numeric", month: "short" },
  );
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

/** "today", "yesterday", "3 days ago", "Oct 14" */
export function pastDateLabel(date: string, on: string): string {
  const days = daysBetween(date, on);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return Temporal.PlainDate.from(date).toLocaleString("en", { day: "numeric", month: "short" });
}
