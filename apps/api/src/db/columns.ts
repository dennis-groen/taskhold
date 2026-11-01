// Column types that read and write Temporal values instead of JavaScript Dates.
// Drizzle's node-postgres driver hands timestamps and dates over as the strings Postgres sent.
import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/**
 * A `timestamp` (without time zone) holding a UTC instant, read as a Temporal.Instant.
 * Postgres returns "2026-11-01 13:31:33.621921", or "2026-11-01T13:31:33.621921" inside the JSON of
 * relational queries. Both are read as UTC: the app writes UTC, and `now` defaults assume the
 * database's time zone is UTC, as it is in compose.yaml.
 */
export const instant = customType<{ data: Temporal.Instant; driverData: string }>({
  dataType: () => "timestamp",
  toDriver: (value) => value.toString(),
  fromDriver: (value) => Temporal.Instant.from(`${value.replace(" ", "T")}Z`),
});

/** A `date`: a calendar day with no time or time zone, read as a Temporal.PlainDate */
export const plainDate = customType<{ data: Temporal.PlainDate; driverData: string }>({
  dataType: () => "date",
  toDriver: (value) => value.toString(),
  fromDriver: (value) => Temporal.PlainDate.from(value),
});

/** A `time` (without time zone): a time of day, read as a Temporal.PlainTime */
export const plainTime = customType<{ data: Temporal.PlainTime; driverData: string }>({
  dataType: () => "time",
  toDriver: (value) => value.toString(),
  fromDriver: (value) => Temporal.PlainTime.from(value),
});

/** Default for a column that records when its row was written */
export const now = sql`now()`;
