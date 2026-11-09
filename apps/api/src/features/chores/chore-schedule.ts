// The schedule rules for chores: what marking one done, skipping it or putting it off does to its
// due date. The API applies them when it saves; the web app shows the result before the API
// answers. Both import this one file (the web app as @taskhold/api/chore-schedule), so the rule
// can't differ between them.
//
// It imports nothing at runtime (lint enforces it), so the web app bundles only this file.
//
// Due dates are Temporal.PlainDates: calendar days with no time or time zone, so adding days or
// weeks never trips over a daylight saving change. A repeating chore's next due date counts from
// the day it was done, not from when it was due, so a household that falls behind doesn't come
// back to a pile of overdue chores.

/** Every so many days or weeks */
export type RepeatRule = { every: number; unit: "day" | "week" };

/** What the rules need to know about a chore */
export type ChoreSchedule = {
  repeat: RepeatRule | null;
  /** A repeating chore always has one */
  dueOn: Temporal.PlainDate | null;
  /** The newest entry in its history: the day it was marked done or skipped */
  last: { on: Temporal.PlainDate; skipped: boolean } | null;
};

/** Only a one-off chore is ever done; a repeating one moves on to its next due date instead */
export function isDone(chore: ChoreSchedule): boolean {
  return chore.repeat === null && chore.last !== null && !chore.last.skipped;
}

export type MarkDone =
  /** Done already: today, for a repeating chore, or at all, for a one-off one */
  | { kind: "unchanged" }
  /** Goes in the history; the chore is due on `dueOn` from now */
  | { kind: "done"; dueOn: Temporal.PlainDate | null };

/**
 * Marking the chore done `today`. Doing it again the same day changes nothing, so a double tap or
 * two people at once count once. A skip earlier the same day doesn't count: someone may do it
 * after all.
 */
export function markDone(chore: ChoreSchedule, today: Temporal.PlainDate): MarkDone {
  const { repeat, last } = chore;
  if (!repeat) return isDone(chore) ? UNCHANGED : { kind: "done", dueOn: chore.dueOn };
  if (last && !last.skipped && last.on.equals(today)) return UNCHANGED;
  return { kind: "done", dueOn: addRepeat(today, repeat) };
}

export type Skip =
  /** Skipped already today */
  | { kind: "unchanged" }
  /** Only repeating chores can be skipped */
  | { kind: "not-repeating" }
  /** Goes in the history; the chore is due on `dueOn` from now */
  | { kind: "moved"; dueOn: Temporal.PlainDate };

/**
 * Skipping the chore this time: it moves one repeat on from its due date, or from today when it's
 * overdue, so skipping never leaves it overdue straight away. Skipping twice the same day changes
 * nothing.
 */
export function skip(chore: ChoreSchedule, today: Temporal.PlainDate): Skip {
  const { repeat, dueOn, last } = chore;
  if (!repeat || !dueOn) return { kind: "not-repeating" };
  if (last && last.skipped && last.on.equals(today)) return UNCHANGED;
  const from = Temporal.PlainDate.compare(dueOn, today) < 0 ? today : dueOn;
  return { kind: "moved", dueOn: addRepeat(from, repeat) };
}

/** Whether the chore can be put off to tomorrow: it isn't done, and it's due today or overdue */
export function canPutOff(chore: ChoreSchedule, today: Temporal.PlainDate): boolean {
  return (
    !isDone(chore) && chore.dueOn !== null && Temporal.PlainDate.compare(chore.dueOn, today) <= 0
  );
}

const UNCHANGED = { kind: "unchanged" } as const;

function addRepeat(date: Temporal.PlainDate, { every, unit }: RepeatRule): Temporal.PlainDate {
  return date.add(unit === "week" ? { weeks: every } : { days: every });
}
