import { describe, expect, it } from "vitest";

import type { Category } from "./categories.ts";
import { groupItems, reconcileFolds, sameCategories, type FoldState } from "./shopping-items.ts";
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
  it("puts what's left A to Z and the cart latest first, comparing times rather than text", () => {
    // "…13:00:00Z" sorts after "…13:00:00.5Z" as text, but is earlier
    const { open, checked } = groupItems([
      item("milk", "2026-11-01T13:00:00Z"),
      item("Bread", "2026-11-01T13:00:00.5Z"),
      item("eggs", "2026-11-01T12:00:00Z"),
      item("checked-first", "2026-11-01T12:00:00Z", "2026-11-01T13:00:00.25Z"),
      item("checked-last", "2026-11-01T12:00:00Z", "2026-11-01T13:00:01Z"),
    ]);
    expect(open.map((entry) => entry.id)).toEqual(["Bread", "eggs", "milk"]);
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
    expect(open.map((entry) => entry.id)).toEqual(["bread", "eggs", "milk"]);
    expect(checked.map((entry) => entry.id)).toEqual(["apples"]);
  });

  it("sorts numbers by value", () => {
    const { open } = groupItems([
      item("Batteries 10", "2026-11-01T13:00:00Z"),
      item("Batteries 2", "2026-11-01T13:00:01Z"),
    ]);
    expect(open.map((entry) => entry.id)).toEqual(["Batteries 2", "Batteries 10"]);
  });
});

function state(folded: Category[], peeked: Category[] = []): FoldState {
  return { folded: new Set(folded), peeked: new Set(peeked) };
}

describe("folding completed shopping categories", () => {
  it("folds newly completed categories once this device is quiet, unless peeked", () => {
    const next = reconcileFolds(
      state(["Meat & Fish"], ["Bakery"]),
      new Set<Category>(["Produce", "Bakery", "Meat & Fish"]),
      true,
    );
    expect([...next.folded]).toEqual(["Produce", "Meat & Fish"]);
    expect([...next.peeked]).toEqual(["Bakery"]);
  });

  it("never newly folds a category while this device is mid-tap (even if a housemate finishes another aisle)", () => {
    const next = reconcileFolds(
      state(["Meat & Fish"]),
      new Set<Category>(["Produce", "Dairy & Eggs", "Meat & Fish"]),
      false,
    );
    expect([...next.folded]).toEqual(["Meat & Fish"]);
  });

  it("unfolds a category immediately when an item is unticked or added, even while busy", () => {
    const next = reconcileFolds(
      state(["Meat & Fish", "Pantry"]),
      new Set<Category>(["Pantry"]),
      false,
    );
    expect([...next.folded]).toEqual(["Pantry"]);
  });

  it("clears peek memory when a peeked category becomes open again so it re-folds next time", () => {
    const reopened = reconcileFolds(state([], ["Meat & Fish"]), new Set<Category>(), false);
    expect([...reopened.peeked]).toEqual([]);

    const refolded = reconcileFolds(reopened, new Set<Category>(["Meat & Fish"]), true);
    expect([...refolded.folded]).toEqual(["Meat & Fish"]);
  });

  it("compares category sets by membership", () => {
    expect(
      sameCategories(
        new Set<Category>(["Produce", "Pantry"]),
        new Set<Category>(["Pantry", "Produce"]),
      ),
    ).toBe(true);
    expect(sameCategories(new Set<Category>(["Produce"]), new Set<Category>(["Pantry"]))).toBe(
      false,
    );
    expect(sameCategories(new Set<Category>(["Produce"]), new Set<Category>())).toBe(false);
  });
});
