import { describe, expect, it } from "vitest";

import { repeatLabel, scheduleOf } from "./chore-dates.ts";

describe("chore repeats", () => {
  // The rules themselves are the API's (chore-schedule.ts) and tested there
  it("hands the rules a chore's dates as calendar days", () => {
    const schedule = scheduleOf({
      repeat: { every: 1, unit: "week" },
      dueOn: "2026-11-09",
      lastCompletion: {
        id: "1",
        completedBy: null,
        completedOn: "2026-11-02",
        skipped: true,
        createdAt: "2026-11-02T08:00:00Z",
      },
    });
    expect(schedule.dueOn?.equals(Temporal.PlainDate.from("2026-11-09"))).toBe(true);
    expect(schedule.last?.on.equals(Temporal.PlainDate.from("2026-11-02"))).toBe(true);
    expect(schedule.last?.skipped).toBe(true);
    expect(scheduleOf({ repeat: null, dueOn: null, lastCompletion: null })).toEqual({
      repeat: null,
      dueOn: null,
      last: null,
    });
  });

  it("describes how often a chore repeats", () => {
    expect(repeatLabel({ every: 1, unit: "day" })).toBe("Every day");
    expect(repeatLabel({ every: 1, unit: "week" })).toBe("Every week");
    expect(repeatLabel({ every: 3, unit: "day" })).toBe("Every 3 days");
    expect(repeatLabel({ every: 2, unit: "week" })).toBe("Every 2 weeks");
  });
});
