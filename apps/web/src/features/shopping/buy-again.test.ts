import { describe, expect, it } from "vitest";

import { suggestBuyAgain } from "./buy-again.ts";

const now = Temporal.Instant.from("2026-11-05T12:00:00Z");
const daysAgo = (days: number) => now.subtract({ hours: 24 * days }).toString();

/** Bought `trips` times, every `every` days, the last time `last` days ago */
function bought(name: string, trips: number, every: number, last: number) {
  return {
    name,
    trips,
    firstBoughtAt: daysAgo(last + every * (trips - 1)),
    lastBoughtAt: daysAgo(last),
  };
}

const history = [
  bought("Milk", 10, 4, 5), // overdue: every 4 days, last 5 days ago
  bought("Coffee", 4, 14, 3), // bought recently for how rarely it's needed
  bought("Bread", 6, 7, 7), // due today
  bought("Oat milk", 1, 1, 20), // once: only when typed
  bought("Birthday candles", 1, 1, 60),
  bought("Crème fraîche", 3, 10, 12),
];

describe("buy again", () => {
  it("leads with regulars that are due, and leaves out one-offs and what was just bought", () => {
    expect(suggestBuyAgain(history, { now })).toEqual(["Milk", "Bread", "Crème fraîche"]);
  });

  it("skips what's already on the list, ignoring case and plurals", () => {
    expect(suggestBuyAgain(history, { now, onList: ["milk "] })).toEqual([
      "Bread",
      "Crème fraîche",
    ]);
    const withBananas = [...history, bought("Banana", 4, 5, 6)];
    expect(suggestBuyAgain(withBananas, { now, onList: ["bananas"] })).toEqual([
      "Milk",
      "Bread",
      "Crème fraîche",
    ]);
  });

  it("folds singular/plural and accent variants into one entry using the latest spelling", () => {
    const variants = [
      bought("Banana", 2, 10, 14),
      bought("Bananas", 2, 5, 6),
      bought("creme fraiche", 1, 1, 20),
      bought("Crème fraîche", 1, 1, 8),
    ];
    expect(suggestBuyAgain(variants, { now })).toEqual(["Bananas", "Crème fraîche"]);
  });

  it("leaves items ticked on the list out of idle chips, but still matches them when typed", () => {
    expect(suggestBuyAgain(history, { now, checkedOnList: ["Milk"] })).toEqual([
      "Bread",
      "Crème fraîche",
    ]);
    expect(suggestBuyAgain(history, { now, typed: "mil", checkedOnList: ["Milk"] })).toEqual([
      "Milk",
      "Oat milk",
    ]);
  });

  it("decays and eventually drops abandoned items that are far past their usual cycle", () => {
    const withAbandoned = [
      ...history,
      // Bought twice 2 days apart, 6 months ago: no longer a regular
      bought("Paint roller", 2, 2, 180),
      // Bought weekly, 3 weeks ago: slightly decayed below fresh overdue staples, still offered
      bought("Yogurt", 5, 7, 21),
    ];
    const suggested = suggestBuyAgain(withAbandoned, { now });
    expect(suggested).not.toContain("Paint roller");
    expect(suggested).toContain("Yogurt");
    expect(suggested.indexOf("Milk")).toBeLessThan(suggested.indexOf("Yogurt"));
    // Still findable when typing
    expect(suggestBuyAgain(withAbandoned, { now, typed: "pai" })).toEqual(["Paint roller"]);
  });

  it("falls back to recent one-off buys for new households with few regulars", () => {
    const freshHousehold = [
      bought("Eggs", 1, 1, 5), // recent: show
      bought("Apples", 1, 1, 10), // recent: show (older than Eggs)
      bought("Butter", 1, 1, 1), // bought yesterday: too soon
      bought("Birthday candles", 1, 1, 45), // too old
    ];
    expect(suggestBuyAgain(freshHousehold, { now })).toEqual(["Eggs", "Apples"]);

    // Caps cold-start fill at 6 items
    const manyOneOffs = Array.from({ length: 10 }, (_, index) =>
      bought(`Item ${index}`, 1, 1, 3 + index),
    );
    expect(suggestBuyAgain(manyOneOffs, { now })).toHaveLength(6);
  });

  it("matches what's typed at the start of any word, accents and case aside", () => {
    expect(suggestBuyAgain(history, { now, typed: "mil" })).toEqual(["Milk", "Oat milk"]);
    expect(suggestBuyAgain(history, { now, typed: "creme" })).toEqual(["Crème fraîche"]);
    expect(suggestBuyAgain(history, { now, typed: "b" })).toEqual(["Bread", "Birthday candles"]);
    expect(suggestBuyAgain(history, { now, typed: "lk" })).toEqual([]);
  });

  it("offers recent buys when typed, but not the exact name already typed", () => {
    expect(suggestBuyAgain(history, { now, typed: "cof" })).toEqual(["Coffee"]);
    expect(suggestBuyAgain(history, { now, typed: "Milk" })).toEqual(["Oat milk"]);
  });

  it("keeps the row short", () => {
    const many = Array.from({ length: 30 }, (_, index) => bought(`Item ${index}`, 3, 5, 6));
    expect(suggestBuyAgain(many, { now })).toHaveLength(12);
    expect(suggestBuyAgain(many, { now, typed: "it" })).toHaveLength(8);
  });

  it("has nothing to say without history", () => {
    expect(suggestBuyAgain([], { now })).toEqual([]);
  });
});
