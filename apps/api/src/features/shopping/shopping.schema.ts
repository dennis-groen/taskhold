// The feature's contract: request input and the shapes returned to clients, as zod schemas
// and their inferred types. Response shapes are inferred from the Drizzle table columns.
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { instantSchema } from "../../db/zod.ts";
import { user } from "../auth/auth.table.ts";
import { shoppingItem, shoppingList, shoppingPurchase } from "./shopping.table.ts";

const listName = (schema: z.ZodString) =>
  schema.trim().min(1, "Give the list a name.").max(60, "Keep the name under 60 characters.");

const itemName = (schema: z.ZodString) =>
  schema.trim().min(1, "Type what you need.").max(100, "Keep items under 100 characters.");

// Free text, so "2", "500 g" and "a few" all work. Blank means no quantity.
const quantity = (schema: z.ZodString) =>
  schema
    .trim()
    .max(20, "Keep the quantity under 20 characters.")
    .transform((value) => value || null);

const listFields = { id: (schema: z.ZodString) => schema.pipe(z.uuid()), name: listName };
const itemFields = {
  id: (schema: z.ZodString) => schema.pipe(z.uuid()),
  name: itemName,
  quantity,
};

export const listParam = z.object({
  listId: z.string().min(1).max(64),
});

export const itemParam = listParam.extend({
  itemId: z.string().min(1).max(64),
});

export const listBody = createInsertSchema(shoppingList, listFields).pick({ name: true });

// The id is optional: the app may choose it, so a list it makes keeps its identity
export const createListBody = createInsertSchema(shoppingList, listFields)
  .pick({ id: true, name: true })
  .partial({ id: true });

export const addItemBody = createInsertSchema(shoppingItem, itemFields)
  .pick({
    // Optional client-chosen id, so an optimistically added item keeps its identity
    id: true,
    name: true,
    quantity: true,
  })
  // Keep nullable/defaulted insert fields optional in the inferred request type.
  .partial({ id: true, quantity: true });

export const updateItemBody = z
  .object(createUpdateSchema(shoppingItem, itemFields).pick({ name: true, quantity: true }).shape)
  .extend({ checked: z.boolean().optional() })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });

export type CreateListInput = z.output<typeof createListBody>;
export type AddItemInput = z.output<typeof addItemBody>;
export type UpdateItemInput = z.output<typeof updateItemBody>;

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

const purchaseColumns = createSelectSchema(shoppingPurchase);

/** One name the household has bought, for "buy again": how often, and when first and last */
export const boughtItemSchema = purchaseColumns.pick({ name: true }).extend({
  /** Days it was bought on; two on one day count once */
  trips: z.number(),
  firstBoughtAt: instantSchema,
  lastBoughtAt: instantSchema,
});

export type ShoppingListSummary = z.infer<typeof shoppingListSummarySchema>;
export type ShoppingItemRecord = z.infer<typeof shoppingItemRecordSchema>;
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export type ShoppingList = z.infer<typeof shoppingListSchema>;
export type BoughtItem = z.infer<typeof boughtItemSchema>;
