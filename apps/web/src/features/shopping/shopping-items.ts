import { CATEGORIES, categorize, type Category } from "./categories.ts";
import type { ShoppingItem } from "./shopping.api.ts";

/** Latest first. The API's timestamps vary in precision, so compare them as instants, not text. */
function newestFirst(a: string, b: string): number {
  return Temporal.Instant.compare(Temporal.Instant.from(b), Temporal.Instant.from(a));
}

// Case doesn't matter, and numbers sort by value: "Item 2" before "Item 10"
const byName = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** A to Z, so items keep their place in the list while you shop, and are easy to find */
function alphabetical(a: ShoppingItem, b: ShoppingItem): number {
  // Two items with the same name keep a fixed order between them
  return byName.compare(a.name, b.name) || a.id.localeCompare(b.id);
}

/**
 * Splits a list into what's left to buy (A to Z) and what's in the cart (latest first, so a
 * tick you just made is easy to find).
 * Items in `settling` were just ticked off here: they stay in place among the open ones for now.
 */
export function groupItems(items: ShoppingItem[], settling: ReadonlySet<string> = new Set()) {
  const inCart = (item: ShoppingItem) => item.checked && !settling.has(item.id);
  const open = items.filter((item) => !inCart(item)).toSorted(alphabetical);
  const checked = items
    .filter(inCart)
    .toSorted((a, b) => newestFirst(a.checkedAt ?? a.createdAt, b.checkedAt ?? b.createdAt));
  return { open, checked };
}

/**
 * Items under their category, in supermarket order, leaving out empty ones. Null when nothing is
 * recognised (a list for the hardware store, say), so the list shows no headings at all.
 */
export function byCategory(
  items: ShoppingItem[],
): { category: Category; items: ShoppingItem[] }[] | null {
  const sorted = new Map<Category, ShoppingItem[]>();
  for (const item of items) {
    const category = categorize(item.name);
    sorted.set(category, [...(sorted.get(category) ?? []), item]);
  }
  if (sorted.size === 0 || (sorted.size === 1 && sorted.has("Other"))) return null;
  return CATEGORIES.flatMap((category) => {
    const inCategory = sorted.get(category);
    return inCategory ? [{ category, items: inCategory }] : [];
  });
}

export type FoldState = {
  /** Completed category cards currently folded to their header */
  folded: ReadonlySet<Category>;
  /** Completed category cards the shopper tapped open to peek inside */
  peeked: ReadonlySet<Category>;
};

/**
 * Next fold state for category cards on a shopping list. A card unfolds the moment an item in it
 * is unticked or added (even mid-tap), and peek memory clears as soon as the section is no longer
 * all done. Newly completed cards only fold once this device is quiet, so a housemate finishing
 * another aisle never jumps rows under your thumb.
 */
export function reconcileFolds(
  current: FoldState,
  allDone: ReadonlySet<Category>,
  quiet: boolean,
): FoldState {
  const peeked = new Set([...current.peeked].filter((category) => allDone.has(category)));
  const candidates = quiet ? allDone : current.folded;
  const folded = new Set(
    [...candidates].filter((category) => allDone.has(category) && !peeked.has(category)),
  );
  return { folded, peeked };
}

/** Whether two category sets hold the same members */
export function sameCategories(a: ReadonlySet<Category>, b: ReadonlySet<Category>): boolean {
  if (a.size !== b.size) return false;
  for (const category of a) {
    if (!b.has(category)) return false;
  }
  return true;
}
