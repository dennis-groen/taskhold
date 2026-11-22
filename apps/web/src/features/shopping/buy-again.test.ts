import { describe, expect, it } from "vitest";

import { browseBuyAgain, filterEnterTarget, lastBoughtCue, suggestBuyAgain } from "./buy-again.ts";
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

describe("browseBuyAgain", () => {
  it("splits due items into Running low and groups the rest by supermarket aisle", () => {
    const items = [
      bought("Milk", 10, 4, 5, { quantity: "2", listIds: ["groceries"] }), // due -> Running low
      bought("Coffee", 4, 14, 2, { listIds: ["groceries"] }), // recent -> Drinks
      bought("Apples", 1, 1, 12, { listIds: ["groceries"] }), // one-off -> Produce
      bought("Batteries", 4, 14, 15, { listIds: ["hardware"] }), // other list
    ];

    const scoped = browseBuyAgain(items, { now, listId: "groceries" });
    expect(scoped.due.map((item) => item.name)).toEqual(["Milk"]);
    expect(scoped.sections.map((section) => section.category)).toEqual(["Produce", "Drinks"]);
    expect(scoped.sections[0]?.items.map((item) => item.name)).toEqual(["Apples"]);
    expect(scoped.sections[1]?.items.map((item) => item.name)).toEqual(["Coffee"]);
    expect(scoped.hasOtherLists).toBe(true);
    expect(scoped.total).toBe(3);

    // Including other lists reveals Batteries under Household without putting it in groceries' Running low
    const allLists = browseBuyAgain(items, { now, listId: "groceries", includeOtherLists: true });
    expect(allLists.due.map((item) => item.name)).toEqual(["Milk"]);
    expect(allLists.sections.map((section) => section.category)).toEqual([
      "Produce",
      "Drinks",
      "Household",
    ]);
    expect(allLists.total).toBe(4);
  });

  it("keeps Running low to what's nearly out, while chips can suggest earlier", () => {
    const items = [
      bought("Milk", 10, 4, 5, { listIds: ["groceries"] }), // past its gap -> Running low
      bought("Minced beef", 4, 10, 4, { listIds: ["groceries"] }), // 40% of its gap -> an aisle
      bought("Eggs", 6, 10, 8, { listIds: ["groceries"] }), // 80% of its gap -> Running low
      bought("Parmesan", 4, 20, 10, { listIds: ["groceries"], pairedWith: ["Pasta"] }), // half, paired
      bought("Pasta", 4, 14, 3, { listIds: ["groceries"] }),
    ];
    const catalog = browseBuyAgain(items, {
      now,
      listId: "groceries",
      onList: ["Pasta"],
      inBasket: ["Pasta"],
    });
    expect(catalog.due.map((item) => item.name).toSorted()).toEqual(["Eggs", "Milk", "Parmesan"]);
    // The chips still offer Minced beef: suggesting it early is fine, calling it "due" isn't
    expect(namesOf(items, { now, listId: "groceries" })).toContain("Minced beef");
  });

  it("filters across all lists when searching, matching substrings too", () => {
    const items = [
      bought("Milk", 6, 4, 5, { listIds: ["groceries"] }),
      bought("Oat milk", 2, 7, 3, { listIds: ["groceries"] }),
      bought("Batteries", 4, 14, 15, { listIds: ["hardware"] }),
    ];
    const found = browseBuyAgain(items, { now, listId: "groceries", query: "tter" });
    expect(found.due).toEqual([]);
    expect(found.sections.map((s) => s.items.map((i) => i.name))).toEqual([["Batteries"]]);
  });

  it("keeps items already on the list visible in place with onList/checked flags", () => {
    const items = [
      bought("Milk", 10, 4, 5, { listIds: ["groceries"] }),
      bought("Bread", 6, 7, 7, { listIds: ["groceries"] }),
    ];
    const catalog = browseBuyAgain(items, {
      now,
      listId: "groceries",
      onList: ["Milk"],
      checkedOnList: ["Bread"],
    });
    expect(catalog.due).toMatchObject([{ name: "Milk", onList: true, checked: false }]);
    expect(catalog.sections[0]?.items).toMatchObject([
      { name: "Bread", onList: false, checked: true },
    ]);
  });

  it("keeps Running low membership frozen when stickyDueOrder is provided", () => {
    const items = [
      bought("Milk", 10, 4, 5),
      bought("Pasta", 4, 14, 14),
      bought("Passata", 4, 20, 10, { pairedWith: ["Pasta"] }),
    ];
    // Frozen at open with Milk & Pasta due; adding Pasta mid-session doesn't jump Passata into Running low
    const frozen = browseBuyAgain(items, {
      now,
      onList: ["Pasta"],
      inBasket: ["Pasta"],
      stickyDueOrder: ["milk", "pasta"],
    });
    expect(frozen.due.map((item) => item.name)).toEqual(["Milk", "Pasta"]);
    expect(frozen.sections.flatMap((s) => s.items.map((i) => i.name))).toEqual(["Passata"]);
  });
});

describe("filterEnterTarget", () => {
  const items = [
    bought("Oat milk", 3, 7, 3),
    bought("3 color bell pepper", 3, 7, 3),
    bought("Croissants", 3, 7, 3),
    bought("Cream cheese", 3, 7, 3),
    bought("Chocolate", 3, 7, 3),
  ];
  const shown = (query: string) =>
    browseBuyAgain(items, { now, query }).sections.flatMap((section) => section.items);
  const target = (query: string) => {
    const result = filterEnterTarget(shown(query), query);
    return result.kind === "item" ? result.item.name : result.kind;
  };

  it("acts on the exact name, or the one past buy the text abbreviates", () => {
    expect(target("chocolate")).toBe("Chocolate");
    expect(target("pepp")).toBe("3 color bell pepper");
    expect(target("cro")).toBe("Croissants");
  });

  it("adds what was typed when it's a whole word of another name, not that item", () => {
    expect(target("milk")).toBe("add");
    expect(target("bell")).toBe("add");
  });

  it("waits for more typing when several past buys fit", () => {
    expect(filterEnterTarget(shown("c"), "c")).toEqual({ kind: "ambiguous", count: 4 });
  });

  it("doesn't match single letters inside words, and puts the best-matching aisle first", () => {
    expect(shown("i").map((item) => item.name)).toEqual([]);
    expect(shown("che").map((item) => item.name)).toEqual(["Cream cheese"]);
  });
});

describe("lastBoughtCue", () => {
  it("formats age and usual cadence in warm, consistent copy", () => {
    expect(lastBoughtCue(daysAgo(0), null, now, "UTC")).toBe("Bought today");
    expect(lastBoughtCue(daysAgo(1), null, now, "UTC")).toBe("Bought yesterday");
    expect(lastBoughtCue(daysAgo(5), 7, now, "UTC")).toBe("Bought 5 days ago · weekly");
    expect(lastBoughtCue(daysAgo(10), 14, now, "UTC")).toBe("Bought 10 days ago · every 2 weeks");
    expect(lastBoughtCue(daysAgo(21), 30, now, "UTC")).toBe("Bought 3 weeks ago · monthly");
    expect(lastBoughtCue(daysAgo(65), 4, now, "UTC")).toBe(
      "Last bought in September · every 4 days",
    );
    expect(lastBoughtCue(daysAgo(350), null, now, "UTC")).toBe("Last bought in November 2025");
  });

  it("counts calendar days where you are, not 24-hour blocks", () => {
    // 23:00 in Amsterdam the evening before, 09:00 the next morning: under 24 hours, but yesterday
    const lastNight = "2026-11-04T22:00:00Z";
    const thisMorning = Temporal.Instant.from("2026-11-05T08:00:00Z");
    expect(lastBoughtCue(lastNight, null, thisMorning, "Europe/Amsterdam")).toBe(
      "Bought yesterday",
    );
    // Still July in UTC, but already 1 August in Amsterdam
    expect(lastBoughtCue("2026-07-31T23:30:00Z", null, now, "Europe/Amsterdam")).toBe(
      "Last bought in August",
    );
  });
});
