import { describe, expect, it } from "vitest";

import { addedSince, leftAgo } from "./shopping-trip.ts";

const trip = { startedAt: "2026-11-01T12:00:00Z" };
const sam = { id: "sam", name: "Sam" };
const kim = { id: "kim", name: "Kim" };

describe("addedSince", () => {
  it("is 0 when nothing is newer than the trip", () => {
    const items = [{ createdAt: "2026-11-01T11:00:00Z", addedBy: kim }];
    expect(addedSince(items, trip, "sam")).toBe(0);
  });

  it("ignores the viewer's own items", () => {
    const items = [{ createdAt: "2026-11-01T12:05:00Z", addedBy: sam }];
    expect(addedSince(items, trip, "sam")).toBe(0);
  });

  it("counts other people's newer items, including those from someone who left", () => {
    const items = [
      { createdAt: "2026-11-01T12:05:00Z", addedBy: kim },
      { createdAt: "2026-11-01T12:06:00Z", addedBy: null },
      { createdAt: "2026-11-01T12:07:00Z", addedBy: sam },
      { createdAt: "2026-11-01T11:59:00Z", addedBy: kim },
    ];
    expect(addedSince(items, trip, "sam")).toBe(2);
  });
});

describe("leftAgo", () => {
  it("says just now under a minute, then minutes", () => {
    expect(leftAgo(trip, Temporal.Instant.from("2026-11-01T12:00:59Z"))).toBe("left just now");
    expect(leftAgo(trip, Temporal.Instant.from("2026-11-01T12:05:30Z"))).toBe("left 5 min ago");
  });
});
