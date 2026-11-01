// Shapes the todos feature returns to clients, based on the Drizzle table columns.
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { instantSchema, plainDateSchema } from "../../db/zod.ts";
import { todo } from "./todos.schema.ts";

const todoColumns = createSelectSchema(todo, {
  dueOn: (schema) => schema.pipe(plainDateSchema),
  doneAt: (schema) => schema.pipe(instantSchema),
  createdAt: (schema) => schema.pipe(instantSchema),
});

export const todoSchema = todoColumns
  .pick({ id: true, name: true, notes: true, dueOn: true, doneAt: true, createdAt: true })
  .extend({ done: z.boolean() });

export type Todo = z.infer<typeof todoSchema>;
