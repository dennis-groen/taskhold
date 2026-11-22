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

/** Cold-start fallback for new households with few regulars: recent one-offs in this window */
const COLD_START_REGULARS = 3;
const COLD_START_LIMIT = 6;
const COLD_START_MIN_HOURS = 2 * 24;
const COLD_START_MAX_HOURS = 30 * 24;

const DAY_HOURS = 24;

/**
 * The names to suggest, best first.
 *
 * Variants that only differ in case, accents or a trailing plural ("Banana" and "Bananas") are
 * folded into one entry spelled the way it was last bought.
 *
 * With nothing typed: regulars (bought on two days or more) that are due, the most overdue and
 * most often bought first. Items far past their usual cycle decay and eventually drop off so
 * abandoned or seasonal buys don't clog the row. Households with fewer than three regulars yet
 * also see recent one-off buys (2–30 days ago) so the row is useful right away.
 *
 * While typing: anything bought in the last year with a word starting with what's typed, names
 * that start with it first, ignoring case and accents. The exact name typed isn't repeated.
 *
 * What's already waiting on the list is always left out; what's ticked on the list is treated as
 * just bought so it stays out of idle suggestions without hiding from typed searches.
 */
export function suggestBuyAgain(
  history: BoughtItem[],
  {
    now,
    typed = "",
    onList = [],
    checkedOnList = [],
  }: {
    now: Temporal.Instant;
    typed?: string;
    onList?: readonly string[];
    checkedOnList?: readonly string[];
  },
): string[] {
  const merged = mergeVariants(history);
  const waiting = new Set(onList.map(itemKey));
  const checked = new Set(checkedOnList.map(itemKey));
  const query = fold(typed);
  const totalRegulars = merged.filter((item) => item.trips >= 2).length;

  const candidates = merged
    .filter((item) => !waiting.has(itemKey(item.name)))
    .map((item) => {
      const isChecked = checked.has(itemKey(item.name));
      const lateness = isChecked ? 0 : due(item, now);
      return {
        item,
        name: item.name,
        isChecked,
        lateness,
        idleScore: idleScore(item.trips, lateness),
        typingScore: typingScore(item.trips, lateness),
      };
    });

  if (!query) {
    const regulars = candidates
      .filter(
        ({ isChecked, lateness }) =>
          !isChecked && lateness !== null && urgency(lateness) >= JUST_BOUGHT,
      )
      .toSorted((a, b) => byScore(a.idleScore, b.idleScore, a.name, b.name))
      .slice(0, REGULARS_LIMIT)
      .map(({ name }) => name);

    if (totalRegulars < COLD_START_REGULARS && regulars.length < COLD_START_LIMIT) {
      const recentOneOffs = candidates
        .filter(({ item, isChecked }) => {
          if (isChecked || item.trips !== 1) return false;
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
        .map(({ name }) => name);
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
    .map(({ name }) => name);
}

/** Combines singular/plural and accent variants into one entry, keeping the latest spelling */
function mergeVariants(history: BoughtItem[]): BoughtItem[] {
  const byKey = new Map<string, BoughtItem>();
  for (const item of history) {
    const key = itemKey(item.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
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
    byKey.set(key, {
      name: itemIsNewer ? item.name : existing.name,
      trips: existing.trips + item.trips,
      firstBoughtAt: itemIsOlder ? item.firstBoughtAt : existing.firstBoughtAt,
      lastBoughtAt: itemIsNewer ? item.lastBoughtAt : existing.lastBoughtAt,
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
