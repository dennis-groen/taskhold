// What someone typed to add an item: the quantity they wrote into the name ("2 milk",
// "bananas x6", "500g minced beef") pulled out into its own field, and whether the item is
// already waiting on the list.

/** The API's limit on a quantity */
const MAX_QUANTITY = 20;

/** A count, or an amount that may have decimals: "2", "1.5", "1,5", "½" */
const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?|[½¼¾])`;

/** Measures, which are never an item on their own: "500 g" is a quantity with no name */
const MEASURES = [
  "g",
  "gr",
  "grams?",
  "kg",
  "kilos?",
  "mg",
  "ml",
  "cl",
  "dl",
  "l",
  "ltr",
  "lit(?:re|er)s?",
  "lbs?",
  "oz",
].join("|");

/** Measures and containers that belong with the number: "500 g", "2 bags", "3 tins" */
const UNITS = [
  MEASURES,
  "packs?",
  "packets?",
  "bags?",
  "tins?",
  "cans?",
  "bottles?",
  "jars?",
  "box(?:es)?",
  "cartons?",
  "tubs?",
  "dozen",
  "loaf",
  "loaves",
  "bunch(?:es)?",
  "heads?",
  "pieces?",
  "pcs",
  "rolls?",
  "slices?",
  "bars?",
].join("|");

// "2 milk", "2x milk", "2 x milk", "500g beef", "1.5 kg potatoes", "2 bags of rice"
const LEADING = new RegExp(
  String.raw`^(${NUMBER}(?:\s*(?:${UNITS})\b\.?)?)\s*(?:[x×](?=\s))?\s+(?:of\s+)?(.+)$`,
  "iu",
);
// "bananas x6", "bananas x 6", "bananas 6x"
const TRAILING_COUNT = /^(.+?)\s+(?:[x×]\s*(\d+)|(\d+)\s*[x×])$/iu;
// "chicken thighs 1kg", "cola 1.5 l"
const TRAILING_AMOUNT = new RegExp(String.raw`^(.+?)\s+(${NUMBER}\s*(?:${UNITS})\.?)$`, "iu");
const MEASURE_ONLY = new RegExp(String.raw`^(?:${MEASURES})\.?$`, "iu");

export type Entry = { name: string; quantity: string | null };

/**
 * The item's name and quantity from what was typed. A quantity typed into its own field wins and
 * the name is left as it is; otherwise a quantity at the start or end of the name moves out of it.
 * A bare trailing number stays in the name, since it's often part of it ("Pixel 9", "Cola 330").
 */
export function parseEntry(typedName: string, typedQuantity: string | null = null): Entry {
  const name = typedName.trim();
  const quantity = typedQuantity?.trim() || null;
  if (quantity) return { name, quantity };

  const leading = LEADING.exec(name);
  if (leading?.[1] && leading[2]) {
    const found = entry(leading[2], leading[1]);
    if (found) return found;
  }
  const count = TRAILING_COUNT.exec(name);
  if (count?.[1]) {
    const found = entry(count[1], count[2] ?? count[3] ?? "");
    if (found) return found;
  }
  const amount = TRAILING_AMOUNT.exec(name);
  if (amount?.[1] && amount[2]) {
    const found = entry(amount[1], amount[2]);
    if (found) return found;
  }
  return { name, quantity: null };
}

/** The split, unless it leaves no real name or too long a quantity */
function entry(rawName: string, rawQuantity: string): Entry | null {
  const name = rawName.trim();
  const quantity = rawQuantity.trim();
  if (!/\p{L}/u.test(name) || MEASURE_ONLY.test(name)) return null;
  if (quantity === "" || quantity.length > MAX_QUANTITY) return null;
  // A count of one is what an item without a quantity means anyway
  return { name, quantity: quantity === "1" ? null : quantity };
}

/** The item still waiting on the list that's the same thing as `name`, if there is one */
export function findWaiting<Item extends { name: string; checked: boolean }>(
  items: readonly Item[],
  name: string,
): Item | undefined {
  const wanted = itemKey(name);
  return items.find((item) => !item.checked && itemKey(item.name) === wanted);
}

/**
 * The item on the list that's the same thing as `name`, ticked or not, preferring one still
 * waiting: the dock offers to untick a ticked one instead of adding a second row
 */
export function findOnList<Item extends { name: string; checked: boolean }>(
  items: readonly Item[],
  name: string,
): Item | undefined {
  const wanted = itemKey(name);
  return findWaiting(items, name) ?? items.find((item) => itemKey(item.name) === wanted);
}

/** "Crème fraîche " and "creme fraiche" are the same thing */
export function foldName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Folded, with the last word made singular, so "Bananas" and "banana" match */
export function itemKey(name: string): string {
  const folded = foldName(name);
  const space = folded.lastIndexOf(" ");
  return folded.slice(0, space + 1) + singular(folded.slice(space + 1));
}

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}
