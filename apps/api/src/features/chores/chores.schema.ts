// The feature's contract: request input and the shapes returned to clients, as zod schemas
// and their inferred types. Response shapes are inferred from the Drizzle table columns.
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { instantSchema, plainDateInputSchema, plainDateSchema } from "../../db/zod.ts";
import { user } from "../auth/auth.table.ts";
import { chore, choreCompletion } from "./chores.table.ts";

const choreColumns = createSelectSchema(chore, {
  dueOn: (schema) => schema.pipe(plainDateSchema),
  createdAt: (schema) => schema.pipe(instantSchema),
});

const completionColumns = createSelectSchema(choreCompletion, {
  completedOn: (schema) => schema.pipe(plainDateSchema),
  previousDueOn: (schema) => schema.pipe(plainDateSchema),
  createdAt: (schema) => schema.pipe(instantSchema),
});

const userColumns = createSelectSchema(user);
const userSummarySchema = userColumns.pick({ id: true, name: true });
const assigneeSchema = userColumns.pick({ id: true, name: true, image: true });

export const repeatSchema = z
  .object({
    every: choreColumns.shape.repeatEvery
      .unwrap()
      .min(1, "Repeat at least every 1 day.")
      .max(365, "Repeat at most every 365 days or weeks."),
    unit: choreColumns.shape.repeatUnit.unwrap(),
  })
  .nullable();

export const choreRecordSchema = choreColumns
  .pick({ id: true, name: true, repeatEvery: true, repeatUnit: true, dueOn: true, createdAt: true })
  .extend({ assignee: assigneeSchema.nullable() });

export const completionRecordSchema = completionColumns
  .pick({
    id: true,
    choreId: true,
    completedOn: true,
    previousDueOn: true,
    skipped: true,
    createdAt: true,
  })
  .extend({ completedBy: userSummarySchema.nullable() });

export const choreCompletionSchema = completionRecordSchema.pick({
  id: true,
  completedOn: true,
  skipped: true,
  createdAt: true,
  completedBy: true,
});

export const choreSchema = choreRecordSchema
  .pick({ id: true, name: true, dueOn: true, assignee: true })
  .extend({
    repeat: repeatSchema,
    lastCompletion: choreCompletionSchema.nullable(),
    done: z.boolean(),
  });

export const choreDetailSchema = choreSchema.extend({ history: z.array(choreCompletionSchema) });

export type Repeat = NonNullable<z.infer<typeof repeatSchema>>;
export type ChoreRecord = z.infer<typeof choreRecordSchema>;
export type CompletionRecord = z.infer<typeof completionRecordSchema>;
export type ChoreCompletion = z.infer<typeof choreCompletionSchema>;
export type Chore = z.infer<typeof choreSchema>;
export type ChoreDetail = z.infer<typeof choreDetailSchema>;

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

/** Skipping says what day it is too: an overdue chore's next date counts on from today */
export const skipChoreBody = completeChoreBody;

export type CreateChoreInput = z.output<typeof createChoreBody>;
export type UpdateChoreInput = z.output<typeof updateChoreBody>;
