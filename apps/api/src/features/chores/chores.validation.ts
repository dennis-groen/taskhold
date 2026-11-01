import { z } from "zod";

const choreName = z
  .string()
  .trim()
  .min(1, "Give the chore a name.")
  .max(60, "Keep the name under 60 characters.");

// Validated as an ISO date, then handed to the service as a calendar day
const date = z.iso
  .date("Use a date like 2026-03-14.")
  .transform((value) => Temporal.PlainDate.from(value));

const repeat = z
  .object({
    every: z
      .number()
      .int()
      .min(1, "Repeat at least every 1 day.")
      .max(365, "Repeat at most every 365 days or weeks."),
    unit: z.enum(["day", "week"]),
  })
  .nullable();

const assigneeId = z.string().min(1).max(64).nullable();

export const choreParam = z.object({
  choreId: z.string().min(1).max(64),
});

export const createChoreBody = z.object({
  name: choreName,
  repeat,
  dueOn: date.nullable(),
  assigneeId,
});

export const updateChoreBody = z
  .object({
    name: choreName.optional(),
    repeat: repeat.optional(),
    dueOn: date.nullable().optional(),
    assigneeId: assigneeId.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });

export const completeChoreBody = z.object({
  /** What day it is where the person is */
  today: date,
});
