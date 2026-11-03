// Sorts shopping items into supermarket categories by their name, using the word list in
// grocery-words.ts. Works out the category each time, so nothing is stored and it works offline.
import { GROCERY_WORDS } from "./grocery-words.ts";

/** In the order you'd walk past them in a typical supermarket */
export const CATEGORIES = [
  "Produce",
  "Bakery",
  "Meat & Fish",
  "Dairy & Eggs",
  "Pantry",
  "Frozen",
  "Snacks & Sweets",
  "Drinks",
  "Household",
  "Personal care",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Words that put an item in a category whatever else its name says
const OVERRIDES = new Map<string, Category>([
  ["frozen", "Frozen"],
  ["canned", "Pantry"],
  ["tinned", "Pantry"],
  ["dried", "Pantry"],
]);

type Phrase = { words: string[]; category: Category };

const PHRASES: Phrase[] = CATEGORIES.flatMap((category) =>
  category === "Other"
    ? []
    : GROCERY_WORDS[category].map((phrase) => ({ words: tokens(phrase), category })),
);

/**
 * The category an item's name points to, or "Other". The most specific match wins: the phrase
 * with the most words, then (as English puts the main word last) the one that ends latest, then
 * one written exactly as typed over one that only matches without a plural ending. So
 * "coconut milk" is Pantry, "apple juice" Drinks, "chicken soup" Pantry and "mints" Snacks.
 */
export function categorize(name: string): Category {
  const words = tokens(name);
  for (const word of words) {
    const override = OVERRIDES.get(word);
    if (override) return override;
  }

  let best: (Match & { category: Category }) | null = null;
  for (const phrase of PHRASES) {
    const match = lastMatch(words, phrase.words);
    if (match && (!best || beats(match, best))) best = { ...match, category: phrase.category };
  }
  return best?.category ?? "Other";
}

/** Lowercase words without accents, digits or punctuation: "2x Crème fraîche" → creme, fraiche */
function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

type Match = { length: number; end: number; exact: boolean };

function beats(a: Match, b: Match): boolean {
  if (a.length !== b.length) return a.length > b.length;
  if (a.end !== b.end) return a.end > b.end;
  return a.exact && !b.exact;
}

/** Where the phrase last appears in the words, or null */
function lastMatch(words: string[], phrase: string[]): Match | null {
  for (let start = words.length - phrase.length; start >= 0; start--) {
    const found = words.slice(start, start + phrase.length);
    if (found.every((word, offset) => sameWord(word, phrase[offset] ?? ""))) {
      return {
        length: phrase.length,
        end: start + phrase.length,
        exact: found.every((word, offset) => word === phrase[offset]),
      };
    }
  }
  return null;
}

/** Equal, or equal once a plural ending is taken off either side: "berries" and "berry" */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const forms = singulars(a);
  return singulars(b).some((form) => forms.includes(form));
}

function singulars(word: string): string[] {
  const forms = [word];
  const add = (form: string) => {
    if (form.length >= 3) forms.push(form);
  };
  if (word.endsWith("ies")) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ves")) add(`${word.slice(0, -3)}f`);
  if (word.endsWith("es")) add(word.slice(0, -2));
  if (word.endsWith("s")) add(word.slice(0, -1));
  return forms;
}
