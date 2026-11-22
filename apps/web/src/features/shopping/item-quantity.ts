// The − and + next to an item's quantity. Quantities are free text ("2", "500 g", "a few"), so
// these only step a whole number at the start and leave the rest as typed: "2 bags" → "3 bags".

/** The API's limit, so a step never makes a quantity it would refuse */
const MAX_LENGTH = 20;

// A whole number, then anything that isn't more of the number: "1.5 kg" and "1,5 kg" don't step
const LEADING_COUNT = /^(\d+)(?!\d)(?![.,]\d)(.*)$/s;

// A weight or volume after the number: one more of "500g" is "501g", which nobody means
const MEASURE = /^\s*(?:k?g|gr|mg|grams?|kilos?|[mcd]?l|lit(?:er|re)s?|oz|lbs?|gal|pt|cups?)\b/i;

/**
 * The quantity one more or one fewer than `value`, or null when that step doesn't apply.
 * Blank means one of it, so + makes "2", and − from 1 clears it again.
 */
export function stepQuantity(value: string, by: 1 | -1): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return by === 1 ? "2" : null;

  const match = LEADING_COUNT.exec(trimmed);
  if (!match) return null;
  const rest = match[2] ?? "";
  if (MEASURE.test(rest)) return null;
  const count = Number(match[1]) + by;
  if (count < 1) return "";
  const next = `${count}${rest}`;
  return next.length <= MAX_LENGTH ? next : null;
}
