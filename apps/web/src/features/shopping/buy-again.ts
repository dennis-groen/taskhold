// "Buy again": which of the household's past buys to offer as one-tap chips, and how to organize
// the full purchase history for the Restock sheet. Ranked here, not in the API, so suggestions
// follow what's on the list and what's being typed, offline too.
import { CATEGORIES, categorize, type Category } from "./categories.ts";
import { foldName as fold, itemKey } from "./item-entry.ts";
import type { BoughtItem, ShoppingList } from "./shopping.api.ts";

/** How many chips to offer with nothing typed, and while typing */
const REGULARS_LIMIT = 12;
const MATCHES_LIMIT = 8;

/** A regular bought within this share of its usual gap is probably still in the cupboard */
const JUST_BOUGHT = 0.25;

/**
 * "Running low" in the Buy again sheet (and its "Add all" and the dock's count) is a promise,
 * so it waits until most of the usual gap has passed. Chips can suggest earlier than that.
 */
const RUNNING_LOW = 0.8;
/** Something often bought with what's on the list joins "Running low" from half its usual gap */
const PAIRED_RUNNING_LOW = 0.5;

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
 * With nothing typed: regulars (bought on two days or more) that are running low, scoped to `listId` when
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
      const lateness = isChecked ? 0 : howLate(item, now);
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
 * How far into its usual gap a regular is: 1 means it runs out today, 1.5 that it's half a gap late.
 * Null for something bought only once, which has no usual gap.
 */
function howLate({ trips, firstBoughtAt, lastBoughtAt }: BoughtItem, now: Temporal.Instant) {
  if (trips < 2) return null;
  const last = Temporal.Instant.from(lastBoughtAt);
  const span = Temporal.Instant.from(firstBoughtAt).until(last).total("hours");
  const gap = Math.max(span / (trips - 1), DAY_HOURS);
  return last.until(now).total("hours") / gap;
}

/**
 * Rises with lateness up to a plateau once it's running low, then decays once an item is far past its
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

export type BuyAgainCatalogItem = {
  name: string;
  quantity: string | null;
  variants: string[];
  trips: number;
  lastBoughtAt: string;
  /** Approximate usual cycle in whole days, or null for one-offs */
  usualDays: number | null;
  /** True when running low, or boosted by an item currently in the basket */
  runningLow: boolean;
  /** True when boosted because an item it's often bought with is already waiting on the list */
  paired: boolean;
  /** True when currently waiting (unchecked) on the target list */
  onList: boolean;
  /** True when currently ticked on the target list */
  checked: boolean;
  /** True when bought on this list or has no list affinity yet */
  forThisList: boolean;
  /** How the filter matched it: 0 the name's start, 1 a word's start, 2 inside a word; null unfiltered */
  match: 0 | 1 | 2 | null;
};

export type BuyAgainCatalog = {
  /** Regulars running low and basket-paired items for this list (empty while filtering by search) */
  runningLow: BuyAgainCatalogItem[];
  /** Remaining past buys grouped by supermarket aisle in walking order */
  sections: { category: Category; items: BuyAgainCatalogItem[] }[];
  /** True when the household also has past buys tied exclusively to other lists */
  hasOtherLists: boolean;
  /** Total visible items across Running low and the aisle sections */
  total: number;
};

/**
 * Full purchase history organized for the Buy again sheet: a "Running low" group at the top (when
 * not searching), followed by every remaining past buy grouped by supermarket aisle.
 */
export function browseBuyAgain(
  history: BoughtItem[],
  {
    now,
    listId,
    query = "",
    includeOtherLists = false,
    onList = [],
    inBasket,
    checkedOnList = [],
    stickyRunningLowOrder,
  }: {
    now: Temporal.Instant;
    listId?: string;
    query?: string;
    includeOtherLists?: boolean;
    onList?: readonly string[];
    inBasket?: readonly string[];
    checkedOnList?: readonly string[];
    /** Frozen itemKey order for "Running low" so rows never jump sections while tapping */
    stickyRunningLowOrder?: readonly string[];
  },
): BuyAgainCatalog {
  const merged = mergeVariants(history);
  const waiting = new Set(onList.map(itemKey));
  const basket = new Set((inBasket ?? onList).map(itemKey));
  const checked = new Set(checkedOnList.map(itemKey));
  const foldedQuery = fold(query);
  const searching = foldedQuery !== "";
  const stickyRank = stickyRunningLowOrder
    ? new Map(stickyRunningLowOrder.map((key, index) => [key, index]))
    : null;

  const belongsToOtherList = (item: MergedBoughtItem) =>
    Boolean(listId && item.listIds.length > 0 && !item.listIds.includes(listId));

  const hasOtherLists = merged.some(belongsToOtherList);

  const enriched = merged.map((item) => {
    const key = itemKey(item.name);
    const isOnList = waiting.has(key);
    const isChecked = checked.has(key);
    const otherList = belongsToOtherList(item);
    const lateness = isChecked ? 0 : howLate(item, now);
    const pairMatches =
      isChecked || isOnList
        ? 0
        : item.pairedWith.filter((other) => basket.has(itemKey(other))).length;
    const isRunningLow = stickyRank
      ? stickyRank.has(key) && !otherList
      : !isChecked &&
        !otherList &&
        ((lateness !== null && urgency(lateness) >= RUNNING_LOW) ||
          (pairMatches > 0 && (lateness === null || lateness >= PAIRED_RUNNING_LOW)));
    const onThisList = Boolean(listId && item.listIds.includes(listId));
    const fit = searching ? catalogMatch(fold(item.name), foldedQuery) : null;
    const rankScore =
      idleScore(item.trips, lateness) * (onThisList ? LIST_BOOST : 1) + pairMatches * PAIR_BOOST;

    return {
      key,
      entry: {
        name: item.name,
        quantity: item.quantity,
        variants: item.variants,
        trips: item.trips,
        lastBoughtAt: item.lastBoughtAt,
        usualDays: usualGapDays(item),
        runningLow: isRunningLow,
        // "Goes with your list" only when it isn't still in the cupboard from last time
        paired: pairMatches > 0 && (lateness === null || lateness >= JUST_BOUGHT),
        onList: isOnList,
        checked: isChecked,
        forThisList: !otherList,
        match: fit,
      } satisfies BuyAgainCatalogItem,
      score: rankScore,
      fit,
    };
  });

  const visible = enriched.filter(({ entry, fit }) => {
    if (searching) return fit !== null;
    return includeOtherLists || entry.forThisList;
  });

  const runningLowItems = searching
    ? []
    : visible
        .filter(({ entry }) => entry.runningLow)
        .toSorted((a, b) => {
          if (stickyRank) {
            return (stickyRank.get(a.key) ?? Infinity) - (stickyRank.get(b.key) ?? Infinity);
          }
          return byScore(a.score, b.score, a.entry.name, b.entry.name);
        })
        .map(({ entry }) => entry);

  const runningLowKeys = new Set(runningLowItems.map((entry) => itemKey(entry.name)));
  const remaining = visible.filter(({ key }) => !runningLowKeys.has(key));

  const grouped = new Map<Category, typeof remaining>();
  for (const candidate of remaining) {
    const category = categorize(candidate.entry.name);
    const bucket = grouped.get(category);
    if (bucket) bucket.push(candidate);
    else grouped.set(category, [candidate]);
  }

  const sections: { category: Category; items: BuyAgainCatalogItem[] }[] = [];
  for (const category of CATEGORIES) {
    const bucket = grouped.get(category);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort((a, b) => {
      if (searching && a.fit !== b.fit) return (a.fit ?? 2) - (b.fit ?? 2);
      if (a.entry.forThisList !== b.entry.forThisList) return a.entry.forThisList ? -1 : 1;
      return (
        b.entry.trips - a.entry.trips ||
        Temporal.Instant.compare(
          Temporal.Instant.from(b.entry.lastBoughtAt),
          Temporal.Instant.from(a.entry.lastBoughtAt),
        ) ||
        a.entry.name.localeCompare(b.entry.name)
      );
    });
    sections.push({ category, items: bucket.map(({ entry }) => entry) });
  }
  // While filtering, the aisle with the best match comes first (then walking order)
  if (searching) {
    const bestFit = (items: BuyAgainCatalogItem[]) => Math.min(...items.map((i) => i.match ?? 2));
    sections.sort((a, b) => bestFit(a.items) - bestFit(b.items));
  }

  return {
    runningLow: runningLowItems,
    sections,
    hasOtherLists,
    total: runningLowItems.length + remaining.length,
  };
}

/**
 * Running low, and not on the list yet: neither waiting nor ticked. What "Add all" in the Buy again
 * sheet adds and the dock counts, so the two never disagree.
 */
export function runningLowToAdd(catalog: BuyAgainCatalog): BuyAgainCatalogItem[] {
  return catalog.runningLow.filter((item) => !item.onList && !item.checked);
}

/** Buy again for one list, read from the history and the list once, judged at `now` */
export type BuyAgainFor = {
  /** The history and the list are both on the device */
  loaded: boolean;
  /**
   * Chips: regulars, or past buys matching what's typed, leaving out what's waiting on the list
   * except the `pinned` items added this visit, so their chips stay put while nothing is typed
   */
  offer: (typed: string, pinned?: ReadonlySet<string>) => BuyAgainSuggestion[];
  /** The sheet: Running low and the aisles */
  browse: (options?: {
    query?: string;
    includeOtherLists?: boolean;
    stickyRunningLowOrder?: readonly string[];
  }) => BuyAgainCatalog;
  runningLowToAdd: () => BuyAgainCatalogItem[];
};

export function buyAgainFor(
  history: BoughtItem[],
  list: ShoppingList | undefined,
  listId: string | undefined,
  now: Temporal.Instant,
): BuyAgainFor {
  const waiting = list?.items.filter((item) => !item.checked) ?? [];
  const waitingNames = waiting.map((item) => item.name);
  const tickedNames = list?.items.filter((item) => item.checked).map((item) => item.name) ?? [];
  const browse: BuyAgainFor["browse"] = (options = {}) =>
    browseBuyAgain(history, {
      now,
      listId,
      ...options,
      onList: waitingNames,
      inBasket: waitingNames,
      checkedOnList: tickedNames,
    });

  return {
    loaded: list !== undefined && history.length > 0,
    offer: (typed, pinned) => {
      const isTyping = typed.trim() !== "";
      const onList = waiting
        .filter((item) => isTyping || !pinned?.has(item.id))
        .map((item) => item.name);
      return suggestBuyAgain(history, {
        now,
        typed,
        listId,
        onList,
        inBasket: waitingNames,
        checkedOnList: tickedNames,
      });
    },
    browse,
    runningLowToAdd: () => runningLowToAdd(browse()),
  };
}

/** Warm, plain hint for a row in the Buy again sheet: "5 days ago · weekly" */
export function lastBoughtCue(
  lastBoughtAt: string,
  usualDays: number | null,
  now: Temporal.Instant,
  /** Whose calendar "today" and "yesterday" follow; the device's own by default */
  timeZone: string = Temporal.Now.timeZoneId(),
): string {
  // Calendar days where you are, so something bought at 23:00 last night reads "yesterday"
  const lastZoned = Temporal.Instant.from(lastBoughtAt).toZonedDateTimeISO(timeZone);
  const today = now.toZonedDateTimeISO(timeZone).toPlainDate();
  const days = Math.max(0, lastZoned.toPlainDate().until(today).days);
  const age =
    days === 0
      ? "Bought today"
      : days === 1
        ? "Bought yesterday"
        : days < 14
          ? `Bought ${days} days ago`
          : days < 45
            ? `Bought ${Math.round(days / 7)} weeks ago`
            : days > 330
              ? `Last bought in ${lastZoned.toLocaleString("en", { month: "long", year: "numeric" })}`
              : `Last bought in ${lastZoned.toLocaleString("en", { month: "long" })}`;

  const cycle =
    usualDays === null || usualDays <= 1
      ? null
      : usualDays >= 6 && usualDays <= 8
        ? "weekly"
        : usualDays >= 12 && usualDays <= 16
          ? "every 2 weeks"
          : usualDays >= 19 && usualDays <= 23
            ? "every 3 weeks"
            : usualDays >= 26 && usualDays <= 34
              ? "monthly"
              : `every ${usualDays} days`;

  return cycle ? `${age} · ${cycle}` : age;
}

/** Below this many letters, a filter only matches the start of a name or word ("i" isn't in everything) */
const SUBSTRING_MIN = 3;

/** 0 prefix match, 1 word-start match, 2 substring match, null no match */
function catalogMatch(name: string, query: string): 0 | 1 | 2 | null {
  if (name.startsWith(query)) return 0;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(query))) return 1;
  return query.length >= SUBSTRING_MIN && name.includes(query) ? 2 : null;
}

export type FilterEnterTarget =
  | { kind: "item"; item: BuyAgainCatalogItem }
  | { kind: "add" }
  | { kind: "ambiguous"; count: number };

/**
 * What Enter in the Buy again filter acts on, given the past buys it shows. The exact name first.
 * Else the one past buy the typed text abbreviates: it starts a word there and stops part-way
 * through it ("pepp" → "3 color bell pepper"). A whole word inside a longer name is a different
 * thing ("milk" isn't "Oat milk"), and a match inside a word is a coincidence. With none of those,
 * Enter adds what was typed; with several, it waits for more typing.
 */
export function filterEnterTarget(
  items: readonly BuyAgainCatalogItem[],
  typedName: string,
): FilterEnterTarget {
  const key = itemKey(typedName);
  const exact = items.find((item) => itemKey(item.name) === key);
  if (exact) return { kind: "item", item: exact };
  const typed = fold(typedName);
  const abbreviated = items.filter((item) => abbreviates(fold(item.name), typed));
  if (abbreviated.length === 1 && abbreviated[0]) return { kind: "item", item: abbreviated[0] };
  if (abbreviated.length > 1) return { kind: "ambiguous", count: abbreviated.length };
  return { kind: "add" };
}

/** True when `typed` starts a word of `name` and ends part-way through a word */
function abbreviates(name: string, typed: string): boolean {
  if (typed === "") return false;
  for (let at = name.indexOf(typed); at !== -1; at = name.indexOf(typed, at + 1)) {
    const startsWord = at === 0 || /[\s-]/.test(name[at - 1] ?? "");
    const next = name[at + typed.length];
    if (startsWord && next !== undefined && !/[\s-]/.test(next)) return true;
  }
  return false;
}

function usualGapDays({ trips, firstBoughtAt, lastBoughtAt }: BoughtItem): number | null {
  if (trips < 2) return null;
  const spanHours = Temporal.Instant.from(firstBoughtAt)
    .until(Temporal.Instant.from(lastBoughtAt))
    .total("hours");
  return Math.max(1, Math.round(spanHours / (trips - 1) / DAY_HOURS));
}

function byScore(aScore: number, bScore: number, aName: string, bName: string) {
  return bScore - aScore || aName.localeCompare(bName);
}
