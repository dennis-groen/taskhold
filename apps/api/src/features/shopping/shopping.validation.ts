import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

import { shoppingItem, shoppingList } from "./shopping.schema.ts";

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

const listFields = { name: listName };
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

export type CreateListInput = z.output<typeof listBody>;
export type AddItemInput = z.output<typeof addItemBody>;
export type UpdateItemInput = z.output<typeof updateItemBody>;
