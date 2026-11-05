// Pure date rules for chores. Due dates are Temporal.PlainDates: calendar days with no time or
// time zone, so adding days or weeks never trips over a daylight saving change.
import type { RepeatUnit } from "./chores.table.ts";

/** The date `every` days or weeks after `date` */
export function addInterval(
  date: Temporal.PlainDate,
  every: number,
  unit: RepeatUnit,
): Temporal.PlainDate {
  return date.add(unit === "week" ? { weeks: every } : { days: every });
}

/**
 * Whether `date` can be today somewhere on Earth right now. Clients say what day it is for them;
 * time zones run from UTC-12 to UTC+14, so it's at most a day either side of the UTC date.
 */
export function couldBeToday(
  date: Temporal.PlainDate,
  utcToday = Temporal.Now.plainDateISO("UTC"),
): boolean {
  return Math.abs(utcToday.until(date, { largestUnit: "days" }).days) <= 1;
}
