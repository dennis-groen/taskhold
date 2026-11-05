// "Buy again": which of the household's past buys to offer as one-tap chips. Ranked here, not in
// the API, so suggestions follow what's on the list and what's being typed, offline too.
import type { BoughtItem } from "./shopping.api.ts";

/** How many chips to offer with nothing typed, and while typing */
const REGULARS_LIMIT = 12;
const MATCHES_LIMIT = 8;

/** A regular bought within this share of its usual gap is probably still in the cupboard */
const JUST_BOUGHT = 0.25;

const DAY_HOURS = 24;

/**
 * The names to suggest, best first.
 *
 * With nothing typed: regulars (bought on two days or more) that are due, the most overdue and
 * most often bought first. Something bought every 4 days and last bought 5 days ago comes before
 * something bought every 2 weeks and last bought 3 days ago, which isn't offered at all.
 *
 * While typing: anything bought in the last year with a word starting with what's typed, names
 * that start with it first, ignoring case and accents. The exact name typed isn't repeated.
 *
 * Either way, what's already waiting on the list is left out.
 */
export function suggestBuyAgain(
  history: BoughtItem[],
  {
    now,
    typed = "",
    onList = [],
  }: { now: Temporal.Instant; typed?: string; onList?: readonly string[] },
): string[] {
  const waiting = new Set(onList.map(fold));
  const query = fold(typed);
  const candidates = history
    .filter((item) => !waiting.has(fold(item.name)))
    .map((item) => {
      const lateness = due(item, now);
      return { name: item.name, lateness, score: score(item.trips, lateness) };
    });

  if (!query) {
    return candidates
      .filter(({ lateness }) => lateness !== null && lateness >= JUST_BOUGHT)
      .toSorted(byScore)
      .slice(0, REGULARS_LIMIT)
      .map(({ name }) => name);
  }

  return candidates
    .map((candidate) => ({ ...candidate, fit: match(fold(candidate.name), query) }))
    .filter(({ fit }) => fit !== null)
    .toSorted((a, b) => (a.fit ?? 0) - (b.fit ?? 0) || byScore(a, b))
    .slice(0, MATCHES_LIMIT)
    .map(({ name }) => name);
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

/** Bought often and due now ranks high; overdue counts up to half a gap, so nothing old dominates */
function score(trips: number, lateness: number | null): number {
  return Math.log2(1 + trips) * (lateness === null ? 0.5 : Math.min(lateness, 1.5));
}

function byScore(a: { name: string; score: number }, b: { name: string; score: number }) {
  return b.score - a.score || a.name.localeCompare(b.name);
}

/** "Crème fraîche " and "creme fraiche" are the same thing */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
