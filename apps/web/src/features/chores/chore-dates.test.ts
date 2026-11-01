import { describe, expect, it } from "vitest";

import { addInterval, repeatLabel } from "./chore-dates.ts";

describe("chore repeats", () => {
  // The API applies the same rule; the client uses it to show the new due date straight away
  it("adds days or weeks to a date", () => {
    expect(addInterval("2026-11-01", { every: 3, unit: "day" })).toBe("2026-11-04");
    expect(addInterval("2026-11-01", { every: 2, unit: "week" })).toBe("2026-11-15");
    expect(addInterval("2026-12-30", { every: 1, unit: "week" })).toBe("2027-01-06");
  });

  it("describes how often a chore repeats", () => {
    expect(repeatLabel({ every: 1, unit: "day" })).toBe("Every day");
    expect(repeatLabel({ every: 1, unit: "week" })).toBe("Every week");
    expect(repeatLabel({ every: 3, unit: "day" })).toBe("Every 3 days");
    expect(repeatLabel({ every: 2, unit: "week" })).toBe("Every 2 weeks");
  });
});
