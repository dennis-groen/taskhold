// Date checks only the API needs. The schedule rules both apps share are in chore-schedule.ts.

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
