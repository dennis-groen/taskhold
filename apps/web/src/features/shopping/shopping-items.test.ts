import { describe, expect, it } from "vitest";

import { groupItems } from "./shopping-items.ts";
import type { ShoppingItem } from "./shopping.api.ts";

function item(id: string, createdAt: string, checkedAt: string | null = null): ShoppingItem {
  return {
    id,
    name: id,
    quantity: null,
    checked: checkedAt !== null,
    addedBy: null,
    checkedBy: null,
    checkedAt,
    createdAt,
  };
}

describe("grouping shopping items", () => {
  it("splits open and checked items, newest first, comparing times rather than text", () => {
    // "…13:00:00Z" sorts after "…13:00:00.5Z" as text, but is earlier
    const { open, checked } = groupItems([
      item("older", "2026-11-01T13:00:00Z"),
      item("newer", "2026-11-01T13:00:00.5Z"),
      item("checked-first", "2026-11-01T12:00:00Z", "2026-11-01T13:00:00.25Z"),
      item("checked-last", "2026-11-01T12:00:00Z", "2026-11-01T13:00:01Z"),
    ]);
    expect(open.map((entry) => entry.id)).toEqual(["newer", "older"]);
    expect(checked.map((entry) => entry.id)).toEqual(["checked-last", "checked-first"]);
  });

  it("keeps items ticked off just now in their place among the open ones", () => {
    const { open, checked } = groupItems(
      [
        item("bread", "2026-11-01T13:00:00Z"),
        item("milk", "2026-11-01T13:00:01Z", "2026-11-01T13:05:00Z"),
        item("eggs", "2026-11-01T13:00:02Z"),
        item("apples", "2026-11-01T12:00:00Z", "2026-11-01T13:04:00Z"),
      ],
      new Set(["milk"]),
    );
    expect(open.map((entry) => entry.id)).toEqual(["eggs", "milk", "bread"]);
    expect(checked.map((entry) => entry.id)).toEqual(["apples"]);
  });
});
