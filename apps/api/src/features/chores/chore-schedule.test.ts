// The schedule rules on their own, without the database. chores.test.ts covers the routes that
// apply them; the web app shows the same results before the API answers.
import { describe, expect, it } from "vitest";

import { canPutOff, isDone, markDone, skip, type ChoreSchedule } from "./chore-schedule.ts";

const date = (text: string) => Temporal.PlainDate.from(text);
const today = date("2026-11-09");
const weekly = { every: 1, unit: "week" } as const;

/** A chore as the rules see it; the defaults are a weekly chore due today, never done */
function chore(overrides: Partial<ChoreSchedule> = {}): ChoreSchedule {
  return { repeat: weekly, dueOn: today, last: null, ...overrides };
}

const doneOn = (on: string) => ({ on: date(on), skipped: false });
const skippedOn = (on: string) => ({ on: date(on), skipped: true });

describe("isDone", () => {
  it.each([
    ["a one-off chore marked done", chore({ repeat: null, last: doneOn("2026-11-01") }), true],
    ["a one-off chore never done", chore({ repeat: null }), false],
    // It stopped repeating after a skip: the skip doesn't make it done
    [
      "a one-off chore whose last entry is a skip",
      chore({ repeat: null, last: skippedOn("2026-11-01") }),
      false,
    ],
    ["a repeating chore, even done today", chore({ last: doneOn("2026-11-09") }), false],
  ])("%s: %s", (_name, schedule, done) => {
    expect(isDone(schedule)).toBe(done);
  });
});

describe("markDone", () => {
  it("counts the next due date from the day it was done, not from when it was due", () => {
    expect(markDone(chore({ dueOn: date("2026-11-01") }), today)).toEqual({
      kind: "done",
      dueOn: date("2026-11-16"),
    });
  });

  it("adds days and weeks to calendar dates, across daylight saving changes and years", () => {
    const due = (repeat: ChoreSchedule["repeat"], on: string) =>
      markDone(chore({ repeat }), date(on));
    expect(due({ every: 1, unit: "day" }, "2026-03-28")).toEqual({
      kind: "done",
      dueOn: date("2026-03-29"),
    });
    expect(due({ every: 2, unit: "week" }, "2026-03-28")).toEqual({
      kind: "done",
      dueOn: date("2026-04-11"),
    });
    expect(due({ every: 3, unit: "day" }, "2026-12-30")).toEqual({
      kind: "done",
      dueOn: date("2027-01-02"),
    });
  });

  it("changes nothing when it was done already today", () => {
    expect(markDone(chore({ last: doneOn("2026-11-09") }), today)).toEqual({ kind: "unchanged" });
  });

  it("can be done again on a later day", () => {
    expect(markDone(chore({ last: doneOn("2026-11-02") }), today).kind).toBe("done");
  });

  it("still counts after a skip earlier the same day", () => {
    expect(markDone(chore({ last: skippedOn("2026-11-09") }), today).kind).toBe("done");
  });

  it("leaves a one-off chore's date as it was", () => {
    expect(markDone(chore({ repeat: null, dueOn: date("2026-11-20") }), today)).toEqual({
      kind: "done",
      dueOn: date("2026-11-20"),
    });
  });

  it("changes nothing for a one-off chore that's done, whenever it was done", () => {
    const done = chore({ repeat: null, last: doneOn("2026-10-01") });
    expect(markDone(done, today)).toEqual({ kind: "unchanged" });
  });
});

describe("skip", () => {
  it.each([
    ["due today", "2026-11-09", "2026-11-16"],
    // Overdue: from today, so it isn't overdue again straight away
    ["overdue", "2026-11-05", "2026-11-16"],
    ["due later", "2026-11-10", "2026-11-17"],
  ])("moves a chore %s one repeat on", (_name, dueOn, next) => {
    expect(skip(chore({ dueOn: date(dueOn) }), today)).toEqual({
      kind: "moved",
      dueOn: date(next),
    });
  });

  it("changes nothing when it was skipped already today", () => {
    expect(skip(chore({ last: skippedOn("2026-11-09") }), today)).toEqual({ kind: "unchanged" });
  });

  it("can skip after it was done earlier the same day", () => {
    expect(skip(chore({ last: doneOn("2026-11-09") }), today).kind).toBe("moved");
  });

  it("only skips repeating chores", () => {
    expect(skip(chore({ repeat: null }), today)).toEqual({ kind: "not-repeating" });
  });
});

describe("canPutOff", () => {
  it.each([
    ["due today", chore(), true],
    ["overdue", chore({ dueOn: date("2026-11-01") }), true],
    ["due later", chore({ dueOn: date("2026-11-10") }), false],
    ["without a due date", chore({ repeat: null, dueOn: null }), false],
    ["a one-off chore that's done", chore({ repeat: null, last: doneOn("2026-11-08") }), false],
  ])("%s: %s", (_name, schedule, allowed) => {
    expect(canPutOff(schedule, today)).toBe(allowed);
  });
});
