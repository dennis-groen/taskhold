import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth/auth.schema.ts";
import { household } from "../households/households.schema.ts";

export const shoppingList = pgTable(
  "shopping_list",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("shopping_list_householdId_idx").on(table.householdId)],
);

export const shoppingItem = pgTable(
  "shopping_item",
  {
    // Clients may pick the id, so an item added optimistically keeps it once saved
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listId: text("list_id")
      .notNull()
      .references(() => shoppingList.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: text("quantity"),
    // People can leave or delete their account; their items stay on the list
    addedById: text("added_by_id").references(() => user.id, { onDelete: "set null" }),
    checkedById: text("checked_by_id").references(() => user.id, { onDelete: "set null" }),
    // Null while the item still needs buying
    checkedAt: timestamp("checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("shopping_item_listId_idx").on(table.listId)],
);

export const shoppingListRelations = relations(shoppingList, ({ one, many }) => ({
  household: one(household, {
    fields: [shoppingList.householdId],
    references: [household.id],
  }),
  items: many(shoppingItem),
}));

export const shoppingItemRelations = relations(shoppingItem, ({ one }) => ({
  list: one(shoppingList, {
    fields: [shoppingItem.listId],
    references: [shoppingList.id],
  }),
}));
