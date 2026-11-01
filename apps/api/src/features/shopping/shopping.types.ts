// API and DAL record types are inferred from their Drizzle table columns.
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { instantSchema } from "../../db/zod.ts";
import { user } from "../auth/auth.schema.ts";
import { shoppingItem, shoppingList } from "./shopping.schema.ts";

const listColumns = createSelectSchema(shoppingList, {
  createdAt: (schema) => schema.pipe(instantSchema),
});
const itemColumns = createSelectSchema(shoppingItem, {
  checkedAt: (schema) => schema.pipe(instantSchema),
  createdAt: (schema) => schema.pipe(instantSchema),
});
const userColumns = createSelectSchema(user).pick({ id: true, name: true });

export const shoppingListSummarySchema = listColumns
  .pick({ id: true, name: true })
  .extend({ itemCount: z.number(), openCount: z.number() });

export const shoppingItemRecordSchema = itemColumns
  .pick({ id: true, name: true, quantity: true, checkedAt: true, createdAt: true })
  .extend({ addedBy: userColumns.nullable(), checkedBy: userColumns.nullable() });

export const shoppingItemSchema = shoppingItemRecordSchema.extend({ checked: z.boolean() });

export const shoppingListSchema = listColumns
  .pick({ id: true, name: true })
  .extend({ items: z.array(shoppingItemSchema) });

export type ShoppingListSummary = z.infer<typeof shoppingListSummarySchema>;
export type ShoppingItemRecord = z.infer<typeof shoppingItemRecordSchema>;
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type ShoppingList = z.infer<typeof shoppingListSchema>;
