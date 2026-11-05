// The feature's contract: request input and the shapes returned to clients, as zod schemas
// and their inferred types. Response shapes are inferred from the Drizzle table columns.
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { instantSchema, plainDateInputSchema, plainDateSchema } from "../../db/zod.ts";
import { todo } from "./todos.table.ts";

const todoName = (schema: z.ZodString) =>
  schema.trim().min(1, "Write what you need to do.").max(100, "Keep it under 100 characters.");

const notes = (schema: z.ZodString) =>
  schema
    .trim()
    .max(1000, "Keep notes under 1000 characters.")
    .transform((value) => value || null);

const todoFields = {
  id: (schema: z.ZodString) => schema.pipe(z.uuid()),
  name: todoName,
  notes,
  dueOn: () => plainDateInputSchema,
};

export const todoParam = z.object({
  todoId: z.string().min(1).max(64),
});

export const createTodoBody = createInsertSchema(todo, todoFields)
  .pick({
    // Optional client-chosen id, so an optimistically added to-do keeps its identity
    id: true,
    name: true,
    notes: true,
    dueOn: true,
  })
  // Drizzle makes nullable/defaulted insert fields optional at runtime; mirror that in API types.
  .partial({ id: true, notes: true, dueOn: true });

export const updateTodoBody = z
  .object(createUpdateSchema(todo, todoFields).pick({ name: true, notes: true, dueOn: true }).shape)
  .extend({ done: z.boolean().optional() })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });

export type CreateTodoInput = z.output<typeof createTodoBody>;
export type UpdateTodoInput = z.output<typeof updateTodoBody>;

const todoColumns = createSelectSchema(todo, {
  dueOn: (schema) => schema.pipe(plainDateSchema),
  doneAt: (schema) => schema.pipe(instantSchema),
  createdAt: (schema) => schema.pipe(instantSchema),
});

export const todoSchema = todoColumns
  .pick({ id: true, name: true, notes: true, dueOn: true, doneAt: true, createdAt: true })
  .extend({ done: z.boolean() });

export type Todo = z.infer<typeof todoSchema>;
