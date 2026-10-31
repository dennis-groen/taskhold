import type { ShoppingItem } from "./shopping.api.ts";

/** Splits a list into what's left to buy (newest first) and what's in the cart (latest first) */
export function groupItems(items: ShoppingItem[]) {
  const open = items
    .filter((item) => !item.checked)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const checked = items
    .filter((item) => item.checked)
    .toSorted((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""));
  return { open, checked };
}
