// Date checks only the API needs. The schedule rules both apps share are in chore-schedule.ts.

// How long a change can wait on a device before it's sent: the web app keeps one for this many
// days (MAX_AGE in apps/web/src/lib/offline-cache.ts). Keep the two the same.
const DAYS_A_CHANGE_CAN_WAIT = 7;

/**
 * Whether `date` can be the day a person tapped. Clients say what day it is for them; time zones
 * run from UTC-12 to UTC+14, so right now it's at most a day either side of the UTC date. A tap
 * made without a connection is sent later with the day of the tap, so days from the last week
 * are accepted too. Later than tomorrow is never right.
 */
export function couldBeToday(
  date: Temporal.PlainDate,
  utcToday = Temporal.Now.plainDateISO("UTC"),
): boolean {
  const days = utcToday.until(date, { largestUnit: "days" }).days;
  return days <= 1 && days >= -(1 + DAYS_A_CHANGE_CAN_WAIT);
}
