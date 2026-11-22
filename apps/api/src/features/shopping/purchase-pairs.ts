// Co-purchase pairs ("often bought together"): finds items frequently bought on the same shopping
// day using lift and conditional confidence, so ubiquitous staples don't pair with everything.

/** Minimum shared shopping days before two items count as a pair */
const MIN_SHARED_TRIPS = 2;

/** Minimum total household shopping days needed before lift is meaningful */
const MIN_TOTAL_TRIPS = 3;

/** Pair must occur at least this much more often than chance */
const MIN_LIFT = 1.5;

/** Buying the trigger item must co-occur with the target on at least this share of its trips */
const MIN_CONFIDENCE = 0.35;

/** Maximum trigger names stored per item */
const MAX_PAIRS_PER_ITEM = 5;

export type PurchaseTripDay = {
  /** Lowercased item name */
  item: string;
  /** Calendar date string ("YYYY-MM-DD") */
  day: string;
};

/**
 * Given distinct (item, day) pairs and a map from lowercased name to display name, returns a map
 * from lowercased item name to the display names of items that strongly trigger it (i.e. when one
 * of those trigger items is on the list, this item is often bought on the same trip).
 */
export function buildPurchasePairs(
  tripDays: readonly PurchaseTripDay[],
  displayNames: ReadonlyMap<string, string>,
): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  const tripsByItem = new Map<string, number>();

  for (const { item, day } of tripDays) {
    if (!displayNames.has(item)) continue;
    let items = byDay.get(day);
    if (!items) {
      items = [];
      byDay.set(day, items);
    }
    if (!items.includes(item)) {
      items.push(item);
      tripsByItem.set(item, (tripsByItem.get(item) ?? 0) + 1);
    }
  }

  const totalTrips = byDay.size;
  if (totalTrips < MIN_TOTAL_TRIPS) return new Map();

  const bothCounts = new Map<string, number>();
  for (const items of byDay.values()) {
    items.sort();
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a) continue;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (!b) continue;
        const pairKey = `${a}\0${b}`;
        bothCounts.set(pairKey, (bothCounts.get(pairKey) ?? 0) + 1);
      }
    }
  }

  // For each target item, collect triggers that strongly predict it
  const triggersByTarget = new Map<string, { name: string; strength: number }[]>();
  const addTrigger = (target: string, trigger: string, strength: number) => {
    const triggerName = displayNames.get(trigger);
    if (!triggerName) return;
    let list = triggersByTarget.get(target);
    if (!list) {
      list = [];
      triggersByTarget.set(target, list);
    }
    list.push({ name: triggerName, strength });
  };

  for (const [pairKey, both] of bothCounts) {
    if (both < MIN_SHARED_TRIPS) continue;
    const sep = pairKey.indexOf("\0");
    const a = pairKey.slice(0, sep);
    const b = pairKey.slice(sep + 1);
    const tripsA = tripsByItem.get(a) ?? 0;
    const tripsB = tripsByItem.get(b) ?? 0;
    if (tripsA === 0 || tripsB === 0) continue;

    const lift = (both * totalTrips) / (tripsA * tripsB);
    if (lift < MIN_LIFT) continue;

    const confAToB = both / tripsA;
    if (confAToB >= MIN_CONFIDENCE) addTrigger(b, a, lift * confAToB);

    const confBToA = both / tripsB;
    if (confBToA >= MIN_CONFIDENCE) addTrigger(a, b, lift * confBToA);
  }

  const result = new Map<string, string[]>();
  for (const [target, triggers] of triggersByTarget) {
    triggers.sort((x, y) => y.strength - x.strength || x.name.localeCompare(y.name));
    result.set(
      target,
      triggers.slice(0, MAX_PAIRS_PER_ITEM).map((entry) => entry.name),
    );
  }
  return result;
}
