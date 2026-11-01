// API and DAL record types are inferred from their Drizzle table columns.
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { instantSchema, plainDateSchema } from "../../db/zod.ts";
import { user } from "../auth/auth.schema.ts";
import { chore, choreCompletion } from "./chores.schema.ts";

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
  .pick({ id: true, choreId: true, completedOn: true, previousDueOn: true, createdAt: true })
  .extend({ completedBy: userSummarySchema.nullable() });

export const choreCompletionSchema = completionRecordSchema.pick({
  id: true,
  completedOn: true,
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
