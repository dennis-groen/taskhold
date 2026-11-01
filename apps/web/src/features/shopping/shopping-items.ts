import type { ShoppingItem } from "./shopping.api.ts";

/** Latest first. The API's timestamps vary in precision, so compare them as instants, not text. */
function newestFirst(a: string, b: string): number {
  return Temporal.Instant.compare(Temporal.Instant.from(b), Temporal.Instant.from(a));
}

/** Splits a list into what's left to buy (newest first) and what's in the cart (latest first) */
export function groupItems(items: ShoppingItem[]) {
  const open = items
    .filter((item) => !item.checked)
    .toSorted((a, b) => newestFirst(a.createdAt, b.createdAt));
  const checked = items
    .filter((item) => item.checked)
    .toSorted((a, b) => newestFirst(a.checkedAt ?? a.createdAt, b.checkedAt ?? b.createdAt));
  return { open, checked };
}
