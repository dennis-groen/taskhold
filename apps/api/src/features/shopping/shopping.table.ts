import { index, pgTable, text } from "drizzle-orm/pg-core";

import { instant, now } from "../../db/columns.ts";

import { user } from "../auth/auth.table.ts";
import { household } from "../households/households.table.ts";

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
    createdAt: instant("created_at").default(now).notNull(),
    updatedAt: instant("updated_at")
      .default(now)
      .$onUpdate(() => Temporal.Now.instant())
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
    checkedAt: instant("checked_at"),
    createdAt: instant("created_at").default(now).notNull(),
  },
  (table) => [index("shopping_item_listId_idx").on(table.listId)],
);

/**
 * What the household has bought, for "buy again" suggestions. A row is written when an item is
 * ticked off and removed when it's unticked, and it outlives the item: "Done shopping" deletes
 * the items, not their history. No link to the person who bought it; only the household's names.
 */
export const shoppingPurchase = pgTable(
  "shopping_purchase",
  {
    // The ticked item's id, so ticking twice, or putting a cleared item back, records it once
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    // Which list it was bought from, so suggestions follow the list. Nullable so deleting a list
    // keeps its purchase history and older rows stay valid.
    listId: text("list_id").references(() => shoppingList.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // The amount bought, so "buy again" can pre-fill the usual quantity
    quantity: text("quantity"),
    boughtAt: instant("bought_at").default(now).notNull(),
  },
  (table) => [
    index("shopping_purchase_household_bought_idx").on(table.householdId, table.boughtAt),
  ],
);
