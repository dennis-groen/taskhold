import { z } from "zod";

const listName = z
  .string()
  .trim()
  .min(1, "Give the list a name.")
  .max(60, "Keep the name under 60 characters.");

const itemName = z
  .string()
  .trim()
  .min(1, "Type what you need.")
  .max(100, "Keep items under 100 characters.");

// Free text, so "2", "500 g" and "a few" all work. Blank means no quantity.
const quantity = z
  .string()
  .trim()
  .max(20, "Keep the quantity under 20 characters.")
  .transform((value) => value || null)
  .nullable();

export const listParam = z.object({
  listId: z.string().min(1).max(64),
});

export const itemParam = listParam.extend({
  itemId: z.string().min(1).max(64),
});

export const listBody = z.object({ name: listName });

export const addItemBody = z.object({
  // Optional client-chosen id, so an optimistically added item keeps its identity
  id: z.uuid().optional(),
  name: itemName,
  quantity: quantity.optional(),
});

export const updateItemBody = z
  .object({
    name: itemName.optional(),
    quantity: quantity.optional(),
    checked: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Nothing to change.",
  });
