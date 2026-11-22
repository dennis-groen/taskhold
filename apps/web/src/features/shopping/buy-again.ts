// "Buy again": which of the household's past buys to offer as one-tap chips. Ranked here, not in
// the API, so suggestions follow what's on the list and what's being typed, offline too.
import { foldName as fold, itemKey } from "./item-entry.ts";
import type { BoughtItem } from "./shopping.api.ts";

/** How many chips to offer with nothing typed, and while typing */
const REGULARS_LIMIT = 12;
const MATCHES_LIMIT = 8;

/** A regular bought within this share of its usual gap is probably still in the cupboard */
const JUST_BOUGHT = 0.25;

/** Overdue urgency plateaus here, then tapers off so abandoned or seasonal items don't linger */
const PEAK_LATENESS = 1.5;
const DECAY_AFTER = 2.5;

/** Floor for typing matches so frequent items still outrank one-offs even when recently bought */
const TYPING_FLOOR = 0.5;

/** Boost for items previously bought on the open list over legacy or other-list items */
const LIST_BOOST = 1.25;

/** Score added per item currently in the basket that's frequently bought with this candidate */
const PAIR_BOOST = 3;

/** Cold-start fallback for new households with few regulars: recent one-offs in this window */
const COLD_START_REGULARS = 3;
const COLD_START_LIMIT = 6;
const COLD_START_MIN_HOURS = 2 * 24;
const COLD_START_MAX_HOURS = 30 * 24;

const DAY_HOURS = 24;

export type BuyAgainSuggestion = {
  name: string;
  /** Usual quantity for this item, or null when usually bought without one */
  quantity: string | null;
  /** Raw history spellings folded into this suggestion (passed to forgetHistory) */
  variants: string[];
  /** True when boosted because an item it's often bought with is already waiting on the list */
  paired: boolean;
};

type MergedBoughtItem = BoughtItem & { variants: string[] };

/**
 * Suggestions to offer, best first.
 *
 * Variants that only differ in case, accents or a trailing plural ("Banana" and "Bananas") are
 * folded into one entry spelled the way it was last bought.
 *
 * With nothing typed: regulars (bought on two days or more) that are due, scoped to `listId` when
 * given (legacy items with no list stay eligible anywhere), with a boost for items often bought
 * on the same trip as something already in `inBasket`. Items far past their usual cycle decay and
 * eventually drop off so abandoned or seasonal buys don't clog the row. Lists with fewer than
 * three regulars yet also see recent one-off buys (2–30 days ago) so the row is useful right away.
 *
 * While typing: anything bought in the last year across all lists with a word starting with what's
 * typed, names that start with it first (preferring items from `listId`), ignoring case and
 * accents. The exact name typed isn't repeated.
 *
 * What's already waiting on the list (`onList`) is always left out; what's ticked (`checkedOnList`)
 * is treated as just bought so it stays out of idle suggestions without hiding from typed searches.
 */
export function suggestBuyAgain(
  history: BoughtItem[],
  {
    now,
    typed = "",
    listId,
    onList = [],
    inBasket,
    checkedOnList = [],
  }: {
    now: Temporal.Instant;
    typed?: string;
    listId?: string;
    onList?: readonly string[];
    /** All open items on the list (including pinned chips), used for co-purchase boosting */
    inBasket?: readonly string[];
    checkedOnList?: readonly string[];
  },
): BuyAgainSuggestion[] {
  const merged = mergeVariants(history);
  const waiting = new Set(onList.map(itemKey));
  const basket = new Set((inBasket ?? onList).map(itemKey));
  const checked = new Set(checkedOnList.map(itemKey));
  const query = fold(typed);

  const belongsToOtherList = (item: MergedBoughtItem) =>
    Boolean(listId && item.listIds.length > 0 && !item.listIds.includes(listId));

  const totalRegulars = merged.filter(
    (item) => item.trips >= 2 && !belongsToOtherList(item),
  ).length;

  const candidates = merged
    .filter((item) => !waiting.has(itemKey(item.name)))
    .map((item) => {
      const isChecked = checked.has(itemKey(item.name));
      const lateness = isChecked ? 0 : due(item, now);
      const pairMatches = isChecked
        ? 0
        : item.pairedWith.filter((other) => basket.has(itemKey(other))).length;
      const onThisList = Boolean(listId && item.listIds.includes(listId));
      return {
        item,
        name: item.name,
        isChecked,
        lateness,
        pairMatches,
        otherList: belongsToOtherList(item),
        idleScore:
          idleScore(item.trips, lateness) * (onThisList ? LIST_BOOST : 1) +
          pairMatches * PAIR_BOOST,
        typingScore: typingScore(item.trips, lateness) * (onThisList ? LIST_BOOST : 1),
      };
    });

  if (!query) {
    const regulars = candidates
      .filter(({ isChecked, otherList, lateness, pairMatches }) => {
        if (isChecked || otherList) return false;
        if (lateness !== null && urgency(lateness) >= JUST_BOUGHT) return true;
        // Co-purchased items surface even if they decayed, unless literally just bought
        return pairMatches > 0 && (lateness === null || lateness >= JUST_BOUGHT);
      })
      .toSorted((a, b) => byScore(a.idleScore, b.idleScore, a.name, b.name))
      .slice(0, REGULARS_LIMIT)
      .map(toSuggestion);

    if (totalRegulars < COLD_START_REGULARS && regulars.length < COLD_START_LIMIT) {
      const picked = new Set(regulars.map((entry) => itemKey(entry.name)));
      const recentOneOffs = candidates
        .filter(({ item, isChecked, otherList }) => {
          if (isChecked || otherList || item.trips !== 1 || picked.has(itemKey(item.name))) {
            return false;
          }
          const ageHours = Temporal.Instant.from(item.lastBoughtAt).until(now).total("hours");
          return ageHours >= COLD_START_MIN_HOURS && ageHours <= COLD_START_MAX_HOURS;
        })
        .toSorted(
          (a, b) =>
            Temporal.Instant.compare(
              Temporal.Instant.from(b.item.lastBoughtAt),
              Temporal.Instant.from(a.item.lastBoughtAt),
            ) || a.name.localeCompare(b.name),
        )
        .slice(0, COLD_START_LIMIT - regulars.length)
        .map(toSuggestion);
      return [...regulars, ...recentOneOffs];
    }

    return regulars;
  }

  return candidates
    .map((candidate) => ({ ...candidate, fit: match(fold(candidate.name), query) }))
    .filter(({ fit }) => fit !== null)
    .toSorted(
      (a, b) =>
        (a.fit ?? 0) - (b.fit ?? 0) || byScore(a.typingScore, b.typingScore, a.name, b.name),
    )
    .slice(0, MATCHES_LIMIT)
    .map(toSuggestion);
}

function toSuggestion({
  item,
  pairMatches,
}: {
  item: MergedBoughtItem;
  pairMatches: number;
}): BuyAgainSuggestion {
  return {
    name: item.name,
    quantity: item.quantity,
    variants: item.variants,
    paired: pairMatches > 0,
  };
}

/** Combines singular/plural and accent variants into one entry, keeping the latest spelling */
function mergeVariants(history: BoughtItem[]): MergedBoughtItem[] {
  const byKey = new Map<string, MergedBoughtItem & { quantityTrips: number; quantityAt: string }>();
  for (const raw of history) {
    // Guard against cached or older-API entries missing fields added after v1
    const item: BoughtItem = {
      ...raw,
      quantity: raw.quantity ?? null,
      listIds: Array.isArray(raw.listIds) ? raw.listIds : [],
      pairedWith: Array.isArray(raw.pairedWith) ? raw.pairedWith : [],
    };
    const key = itemKey(item.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...item,
        variants: [item.name],
        quantityTrips: item.trips,
        quantityAt: item.lastBoughtAt,
      });
      continue;
    }
    const itemIsNewer =
      Temporal.Instant.compare(
        Temporal.Instant.from(item.lastBoughtAt),
        Temporal.Instant.from(existing.lastBoughtAt),
      ) > 0;
    const itemIsOlder =
      Temporal.Instant.compare(
        Temporal.Instant.from(item.firstBoughtAt),
        Temporal.Instant.from(existing.firstBoughtAt),
      ) < 0;
    const preferItemQuantity =
      item.trips > existing.quantityTrips ||
      (item.trips === existing.quantityTrips &&
        Temporal.Instant.compare(
          Temporal.Instant.from(item.lastBoughtAt),
          Temporal.Instant.from(existing.quantityAt),
        ) > 0);
    const listIds = [...new Set([...existing.listIds, ...item.listIds])];
    const pairedWith = [
      ...new Set(
        [...existing.pairedWith, ...item.pairedWith].filter((other) => itemKey(other) !== key),
      ),
    ];
    const variants = existing.variants.includes(item.name)
      ? existing.variants
      : [...existing.variants, item.name];

    byKey.set(key, {
      name: itemIsNewer ? item.name : existing.name,
      quantity: preferItemQuantity ? item.quantity : existing.quantity,
      trips: existing.trips + item.trips,
      firstBoughtAt: itemIsOlder ? item.firstBoughtAt : existing.firstBoughtAt,
      lastBoughtAt: itemIsNewer ? item.lastBoughtAt : existing.lastBoughtAt,
      listIds,
      pairedWith,
      variants,
      quantityTrips: preferItemQuantity ? item.trips : existing.quantityTrips,
      quantityAt: preferItemQuantity ? item.lastBoughtAt : existing.quantityAt,
    });
  }
  return [...byKey.values()];
}

/** 0 when the name starts with the query, 1 when a later word does, null when it doesn't match */
function match(name: string, query: string): 0 | 1 | null {
  if (name === query) return null;
  if (name.startsWith(query)) return 0;
  return name.split(/[\s-]+/).some((word) => word.startsWith(query)) ? 1 : null;
}

/**
 * How far into its usual gap a regular is: 1 means it's due today, 1.5 that it's half a gap late.
 * Null for something bought only once, which has no usual gap.
 */
function due({ trips, firstBoughtAt, lastBoughtAt }: BoughtItem, now: Temporal.Instant) {
  if (trips < 2) return null;
  const last = Temporal.Instant.from(lastBoughtAt);
  const span = Temporal.Instant.from(firstBoughtAt).until(last).total("hours");
  const gap = Math.max(span / (trips - 1), DAY_HOURS);
  return last.until(now).total("hours") / gap;
}

/**
 * Rises with lateness up to a plateau when due/overdue, then decays once an item is far past its
 * usual cycle so abandoned or seasonal buys fade out instead of staying pinned at the front.
 */
function urgency(lateness: number): number {
  if (lateness < JUST_BOUGHT) return 0;
  if (lateness <= PEAK_LATENESS) return lateness;
  if (lateness <= DECAY_AFTER) return PEAK_LATENESS;
  return PEAK_LATENESS * (DECAY_AFTER / lateness);
}

function idleScore(trips: number, lateness: number | null): number {
  return Math.log2(1 + trips) * (lateness === null ? 0 : urgency(lateness));
}

function typingScore(trips: number, lateness: number | null): number {
  return (
    Math.log2(1 + trips) *
    (lateness === null ? TYPING_FLOOR : Math.max(urgency(lateness), TYPING_FLOOR))
  );
}

function byScore(aScore: number, bScore: number, aName: string, bName: string) {
  return bScore - aScore || aName.localeCompare(bName);
}
