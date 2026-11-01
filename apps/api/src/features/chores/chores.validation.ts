import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { plainDateInputSchema } from "../../db/zod.ts";
import { repeatSchema } from "./chores.types.ts";
import { chore } from "./chores.schema.ts";

const choreName = (schema: z.ZodString) =>
  schema.trim().min(1, "Give the chore a name.").max(60, "Keep the name under 60 characters.");

const choreFields = {
  name: choreName,
  dueOn: () => plainDateInputSchema,
  assigneeId: (schema: z.ZodString) => schema.min(1).max(64),
};

export const choreParam = z.object({
  choreId: z.string().min(1).max(64),
});

export const createChoreBody = createInsertSchema(chore, choreFields)
  .pick({ name: true, dueOn: true, assigneeId: true })
  // Inserts make nullable columns optional; this API requires callers to send explicit values.
  .required()
  .extend({ repeat: repeatSchema });

export const updateChoreBody = z
  .object(
    createUpdateSchema(chore, choreFields).pick({ name: true, dueOn: true, assigneeId: true })
      .shape,
  )
  .extend({ repeat: repeatSchema.optional() })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });

export const completeChoreBody = z.object({
  /** What day it is where the person is */
  today: plainDateInputSchema,
});

export type CreateChoreInput = z.output<typeof createChoreBody>;
export type UpdateChoreInput = z.output<typeof updateChoreBody>;
