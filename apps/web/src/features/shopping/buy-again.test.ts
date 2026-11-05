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

  it("skips what's already on the list, ignoring case", () => {
    expect(suggestBuyAgain(history, { now, onList: ["milk "] })).toEqual([
      "Bread",
      "Crème fraîche",
    ]);
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
