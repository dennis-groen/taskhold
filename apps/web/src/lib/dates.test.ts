import { Temporal as PolyfilledTemporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { daysBetween, dueGroup, dueLabel, formatDate, pastDateLabel } from "./dates.ts";

// Browsers without Temporal (Safari) run these helpers on the polyfill, so check both
describe.each([
  ["native Temporal", globalThis.Temporal],
  ["temporal-polyfill", PolyfilledTemporal],
])("with %s", (_name, implementation) => {
  beforeAll(() => vi.stubGlobal("Temporal", implementation));
  afterAll(() => vi.unstubAllGlobals());

  const today = "2026-11-01"; // a Sunday

  it("counts whole days between dates, across daylight saving changes", () => {
    expect(daysBetween(today, "2026-11-04")).toBe(3);
    expect(daysBetween(today, "2026-10-28")).toBe(-4);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("groups due dates relative to today", () => {
    expect(dueGroup("2026-10-31", today)).toBe("overdue");
    expect(dueGroup(today, today)).toBe("today");
    expect(dueGroup("2026-11-07", today)).toBe("week");
    expect(dueGroup("2026-11-08", today)).toBe("later");
    expect(dueGroup(null, today)).toBe("anytime");
  });

  it("labels due dates the way people say them", () => {
    expect(dueLabel("2026-10-31", today)).toBe("1 day overdue");
    expect(dueLabel("2026-10-28", today)).toBe("4 days overdue");
    expect(dueLabel(today, today)).toBe("Due today");
    expect(dueLabel("2026-11-02", today)).toBe("Due tomorrow");
    expect(dueLabel("2026-11-04", today)).toBe("Due Wednesday");
    expect(dueLabel("2026-11-20", today)).toBe("Due Nov 20");
  });

  it("names a weekday within the next week and a date after that", () => {
    expect(formatDate("2026-11-07", today)).toBe("Saturday");
    expect(formatDate("2026-11-08", today)).toBe("Nov 8");
  });

  it("labels past dates", () => {
    expect(pastDateLabel(today, today)).toBe("today");
    expect(pastDateLabel("2026-10-31", today)).toBe("yesterday");
    expect(pastDateLabel("2026-10-27", today)).toBe("5 days ago");
    expect(pastDateLabel("2026-10-14", today)).toBe("Oct 14");
  });
});
