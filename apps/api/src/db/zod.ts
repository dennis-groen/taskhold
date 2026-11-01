import { z } from "zod";

export const instantSchema = z.custom<Temporal.Instant>(
  (value) => value instanceof Temporal.Instant,
  "Expected a Temporal.Instant",
);

export const plainDateSchema = z.custom<Temporal.PlainDate>(
  (value) => value instanceof Temporal.PlainDate,
  "Expected a Temporal.PlainDate",
);

export const plainDateInputSchema = z.iso
  .date("Use a date like 2026-03-14.")
  .transform((value) => Temporal.PlainDate.from(value));
