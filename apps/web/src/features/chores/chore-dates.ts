// Repeat rules for chores. General date helpers (due groups and labels) live in lib/dates.ts.
import type { Repeat } from "./chores.api.ts";

/** The date `every` days or weeks after `date`. Must match the API's rule. */
export function addInterval(date: string, { every, unit }: Repeat): string {
  return Temporal.PlainDate.from(date)
    .add(unit === "week" ? { weeks: every } : { days: every })
    .toString();
}

/** "Every day", "Every 3 days", "Every week", "Every 2 weeks" */
export function repeatLabel({ every, unit }: Repeat): string {
  if (every === 1) return unit === "week" ? "Every week" : "Every day";
  return `Every ${every} ${unit}s`;
}
