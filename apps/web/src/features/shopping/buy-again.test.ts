import { describe, expect, it } from "vitest";

import { suggestBuyAgain } from "./buy-again.ts";
import type { BoughtItem } from "./shopping.api.ts";

const now = Temporal.Instant.from("2026-11-05T12:00:00Z");
const daysAgo = (days: number) => now.subtract({ hours: 24 * days }).toString();

/** Bought `trips` times, every `every` days, the last time `last` days ago */
function bought(
  name: string,
  trips: number,
  every: number,
  last: number,
  extra: Partial<Pick<BoughtItem, "quantity" | "listIds" | "pairedWith">> = {},
): BoughtItem {
  return {
    name,
    quantity: extra.quantity ?? null,
    trips,
    firstBoughtAt: daysAgo(last + every * (trips - 1)),
    lastBoughtAt: daysAgo(last),
    listIds: extra.listIds ?? [],
    pairedWith: extra.pairedWith ?? [],
  };
}

function namesOf(items: BoughtItem[], opts: Parameters<typeof suggestBuyAgain>[1]): string[] {
  return suggestBuyAgain(items, opts).map((item) => item.name);
}

const history = [
  bought("Milk", 10, 4, 5, { quantity: "2" }), // overdue: every 4 days, last 5 days ago
  bought("Coffee", 4, 14, 3), // bought recently for how rarely it's needed
  bought("Bread", 6, 7, 7), // due today
  bought("Oat milk", 1, 1, 20), // once: only when typed
  bought("Birthday candles", 1, 1, 60),
  bought("Crème fraîche", 3, 10, 12),
];

describe("buy again", () => {
  it("leads with regulars that are due, and leaves out one-offs and what was just bought", () => {
    expect(namesOf(history, { now })).toEqual(["Milk", "Bread", "Crème fraîche"]);
    expect(suggestBuyAgain(history, { now })[0]).toEqual({
      name: "Milk",
      quantity: "2",
      variants: ["Milk"],
      paired: false,
    });
  });

  it("skips what's already on the list, ignoring case and plurals", () => {
    expect(namesOf(history, { now, onList: ["milk "] })).toEqual(["Bread", "Crème fraîche"]);
    const withBananas = [...history, bought("Banana", 4, 5, 6)];
    expect(namesOf(withBananas, { now, onList: ["bananas"] })).toEqual([
      "Milk",
      "Bread",
      "Crème fraîche",
    ]);
  });

  it("folds singular/plural and accent variants into one entry using the latest spelling", () => {
    const variants = [
      bought("Banana", 2, 10, 14, { quantity: null }),
      bought("Bananas", 3, 5, 6, { quantity: "6" }),
      bought("creme fraiche", 1, 1, 20),
      bought("Crème fraîche", 1, 1, 8),
    ];
    expect(suggestBuyAgain(variants, { now })).toEqual([
      { name: "Bananas", quantity: "6", variants: ["Banana", "Bananas"], paired: false },
      {
        name: "Crème fraîche",
        quantity: null,
        variants: ["creme fraiche", "Crème fraîche"],
        paired: false,
      },
    ]);
  });

  it("leaves items ticked on the list out of idle chips, but still matches them when typed", () => {
    expect(namesOf(history, { now, checkedOnList: ["Milk"] })).toEqual(["Bread", "Crème fraîche"]);
    expect(namesOf(history, { now, typed: "mil", checkedOnList: ["Milk"] })).toEqual([
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
    const suggested = namesOf(withAbandoned, { now });
    expect(suggested).not.toContain("Paint roller");
    expect(suggested).toContain("Yogurt");
    expect(suggested.indexOf("Milk")).toBeLessThan(suggested.indexOf("Yogurt"));
    // Still findable when typing
    expect(namesOf(withAbandoned, { now, typed: "pai" })).toEqual(["Paint roller"]);
  });

  it("falls back to recent one-off buys for new households with few regulars", () => {
    const freshHousehold = [
      bought("Eggs", 1, 1, 5), // recent: show
      bought("Apples", 1, 1, 10), // recent: show (older than Eggs)
      bought("Butter", 1, 1, 1), // bought yesterday: too soon
      bought("Birthday candles", 1, 1, 45), // too old
    ];
    expect(namesOf(freshHousehold, { now })).toEqual(["Eggs", "Apples"]);

    // Caps cold-start fill at 6 items
    const manyOneOffs = Array.from({ length: 10 }, (_, index) =>
      bought(`Item ${index}`, 1, 1, 3 + index),
    );
    expect(suggestBuyAgain(manyOneOffs, { now })).toHaveLength(6);
  });

  it("scopes idle suggestions to the current list while keeping legacy items and cross-list search", () => {
    const multiList = [
      bought("Milk", 6, 4, 5, { listIds: ["groceries"] }),
      bought("Batteries", 4, 14, 15, { listIds: ["hardware"] }),
      bought("Bread", 5, 7, 7, { listIds: [] }), // legacy purchase with no list
    ];
    expect(namesOf(multiList, { now, listId: "groceries" })).toEqual(["Milk", "Bread"]);
    expect(namesOf(multiList, { now, listId: "hardware" })).toEqual(["Batteries", "Bread"]);
    // Typing still finds items from other lists, preferring ones from this list
    expect(namesOf(multiList, { now, listId: "groceries", typed: "bat" })).toEqual(["Batteries"]);

    const samePrefix = [
      bought("Baking paper", 3, 14, 14, { listIds: ["groceries"] }),
      bought("Batteries", 3, 14, 14, { listIds: ["hardware"] }),
    ];
    expect(namesOf(samePrefix, { now, listId: "hardware", typed: "ba" })).toEqual([
      "Batteries",
      "Baking paper",
    ]);
  });

  it("boosts items frequently bought together with what's already on the list", () => {
    const withPairs = [
      bought("Milk", 6, 4, 5),
      bought("Bread", 6, 7, 7),
      // Not due yet (bought 10 days ago, every 20 days), but paired with Pasta
      bought("Passata", 3, 20, 10, { pairedWith: ["Pasta"] }),
      // Paired with Pasta too, but literally just bought (below JUST_BOUGHT) -> stays hidden
      bought("Parmesan", 3, 20, 1, { pairedWith: ["Pasta"] }),
    ];
    const idle = suggestBuyAgain(withPairs, { now, onList: ["Pasta"] });
    expect(idle.map((item) => item.name)).toEqual(["Passata", "Milk", "Bread"]);
    expect(idle[0]?.paired).toBe(true);
    expect(idle[1]?.paired).toBe(false);

    // Also boosts when the trigger is in `inBasket` (e.g. a pinned chip just tapped)
    const viaBasket = suggestBuyAgain(withPairs, { now, inBasket: ["Pasta"] });
    expect(viaBasket[0]).toMatchObject({ name: "Passata", paired: true });
  });

  it("matches what's typed at the start of any word, accents and case aside", () => {
    expect(namesOf(history, { now, typed: "mil" })).toEqual(["Milk", "Oat milk"]);
    expect(namesOf(history, { now, typed: "creme" })).toEqual(["Crème fraîche"]);
    expect(namesOf(history, { now, typed: "b" })).toEqual(["Bread", "Birthday candles"]);
    expect(namesOf(history, { now, typed: "lk" })).toEqual([]);
  });

  it("offers recent buys when typed, but not the exact name already typed", () => {
    expect(namesOf(history, { now, typed: "cof" })).toEqual(["Coffee"]);
    expect(namesOf(history, { now, typed: "Milk" })).toEqual(["Oat milk"]);
  });

  it("keeps the row short", () => {
    const many = Array.from({ length: 30 }, (_, index) => bought(`Item ${index}`, 3, 5, 6));
    expect(suggestBuyAgain(many, { now })).toHaveLength(12);
    expect(suggestBuyAgain(many, { now, typed: "it" })).toHaveLength(8);
  });

  it("has nothing to say without history", () => {
    expect(suggestBuyAgain([], { now })).toEqual([]);
  });

  it("tolerates legacy cached entries missing quantity, listIds or pairedWith", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- simulates pre-v2 offline cache
    const legacy = [
      {
        name: "Milk",
        trips: 5,
        firstBoughtAt: daysAgo(21),
        lastBoughtAt: daysAgo(5),
      },
    ] as BoughtItem[];
    expect(suggestBuyAgain(legacy, { now, listId: "groceries" })).toEqual([
      { name: "Milk", quantity: null, variants: ["Milk"], paired: false },
    ]);
  });
});
