// Chore dates as the web app shows them. The schedule rules themselves come from the API
// (@taskhold/api/chore-schedule); general date helpers (due groups and labels) live in lib/dates.ts.
import type { ChoreSchedule } from "@taskhold/api/chore-schedule";

import type { Chore, Repeat } from "./chores.api.ts";

/** A chore as the schedule rules see it: its dates as calendar days instead of the API's text */
export function scheduleOf({
  repeat,
  dueOn,
  lastCompletion,
}: Pick<Chore, "repeat" | "dueOn" | "lastCompletion">): ChoreSchedule {
  return {
    repeat,
    dueOn: dueOn === null ? null : Temporal.PlainDate.from(dueOn),
    last: lastCompletion && {
      on: Temporal.PlainDate.from(lastCompletion.completedOn),
      skipped: lastCompletion.skipped,
    },
  };
}

/** "Every day", "Every 3 days", "Every week", "Every 2 weeks" */
export function repeatLabel({ every, unit }: Repeat): string {
  if (every === 1) return unit === "week" ? "Every week" : "Every day";
  return `Every ${every} ${unit}s`;
}
