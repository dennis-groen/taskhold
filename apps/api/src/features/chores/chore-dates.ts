// Pure date rules for chores. Dates are "YYYY-MM-DD" strings with no timezone; the math runs in UTC
// so that adding days never trips over a daylight saving change.
import type { RepeatUnit } from "./chores.schema.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date `every` days or weeks after `date` */
export function addInterval(date: string, every: number, unit: RepeatUnit): string {
  const days = unit === "week" ? every * 7 : every;
  return toDateString(parseDate(date) + days * DAY_MS);
}

/**
 * Whether `date` can be today somewhere on Earth right now. Clients say what day it is for them;
 * timezones run from UTC-12 to UTC+14, so it's at most a day either side of the UTC date.
 */
export function couldBeToday(date: string, now = new Date()): boolean {
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(parseDate(date) - utcToday) <= DAY_MS;
}

function parseDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function toDateString(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
