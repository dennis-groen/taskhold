// Data access for shopping lists: the only place that queries shopping tables.
// Every list query is scoped to a household, so a list id from another household reads as missing.
import { and, asc, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type Executor } from "../../db/db.ts";
import { user } from "../auth/auth.table.ts";
import { shoppingItem, shoppingList, shoppingPurchase } from "./shopping.table.ts";
import type { BoughtItem, ShoppingItemRecord, ShoppingListSummary } from "./shopping.schema.ts";

export type ListSummaryRecord = ShoppingListSummary;
export type ItemRecord = ShoppingItemRecord;
export type ItemChanges = Partial<
  Pick<typeof shoppingItem.$inferInsert, "name" | "quantity" | "checkedAt" | "checkedById">
>;

export async function findListsByHousehold(
  householdId: string,
  executor: Executor = db,
): Promise<ListSummaryRecord[]> {
  return executor
    .select({
      id: shoppingList.id,
      name: shoppingList.name,
      itemCount: count(shoppingItem.id),
      openCount:
        sql<number>`count(${shoppingItem.id}) filter (where ${shoppingItem.checkedAt} is null)`.mapWith(
          Number,
        ),
    })
    .from(shoppingList)
    .leftJoin(shoppingItem, eq(shoppingItem.listId, shoppingList.id))
    .where(eq(shoppingList.householdId, householdId))
    .groupBy(shoppingList.id)
    .orderBy(asc(shoppingList.createdAt));
}

export async function findList(
  ref: { householdId: string; listId: string },
  executor: Executor = db,
): Promise<{ id: string; name: string } | null> {
  const rows = await executor
    .select({ id: shoppingList.id, name: shoppingList.name })
    .from(shoppingList)
    .where(and(eq(shoppingList.id, ref.listId), eq(shoppingList.householdId, ref.householdId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertList(
  values: Pick<typeof shoppingList.$inferInsert, "householdId" | "name">,
  executor: Executor = db,
): Promise<{ id: string }> {
  const rows = await executor
    .insert(shoppingList)
    .values(values)
    .returning({ id: shoppingList.id });
  // An insert without a conflict target always returns its row
  return rows[0];
}

/** Returns false when the household has no list with that id */
export async function renameList(
  ref: { householdId: string; listId: string },
  name: string,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(shoppingList)
    .set({ name })
    .where(and(eq(shoppingList.id, ref.listId), eq(shoppingList.householdId, ref.householdId)))
    .returning({ id: shoppingList.id });
  return rows.length > 0;
}

/** Deletes the list and its items (ON DELETE CASCADE). Returns false when there was no such list. */
export async function deleteList(
  ref: { householdId: string; listId: string },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .delete(shoppingList)
    .where(and(eq(shoppingList.id, ref.listId), eq(shoppingList.householdId, ref.householdId)))
    .returning({ id: shoppingList.id });
  return rows.length > 0;
}

const addedBy = alias(user, "added_by");
const checkedBy = alias(user, "checked_by");

function selectItems(executor: Executor) {
  return executor
    .select({
      id: shoppingItem.id,
      name: shoppingItem.name,
      quantity: shoppingItem.quantity,
      addedById: addedBy.id,
      addedByName: addedBy.name,
      checkedById: checkedBy.id,
      checkedByName: checkedBy.name,
      checkedAt: shoppingItem.checkedAt,
      createdAt: shoppingItem.createdAt,
    })
    .from(shoppingItem)
    .leftJoin(addedBy, eq(addedBy.id, shoppingItem.addedById))
    .leftJoin(checkedBy, eq(checkedBy.id, shoppingItem.checkedById));
}

type ItemRow = Awaited<ReturnType<ReturnType<typeof selectItems>["where"]>>[number];

function toItemRecord(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    addedBy: row.addedById && row.addedByName ? { id: row.addedById, name: row.addedByName } : null,
    checkedBy:
      row.checkedById && row.checkedByName
        ? { id: row.checkedById, name: row.checkedByName }
        : null,
    checkedAt: row.checkedAt,
    createdAt: row.createdAt,
  };
}

/** Newest first */
export async function findItems(listId: string, executor: Executor = db): Promise<ItemRecord[]> {
  const rows = await selectItems(executor)
    .where(eq(shoppingItem.listId, listId))
    .orderBy(desc(shoppingItem.createdAt), desc(shoppingItem.id));
  return rows.map(toItemRecord);
}

export async function findItem(
  ref: { listId: string; itemId: string },
  executor: Executor = db,
): Promise<ItemRecord | null> {
  const rows = await selectItems(executor)
    .where(and(eq(shoppingItem.id, ref.itemId), eq(shoppingItem.listId, ref.listId)))
    .limit(1);
  return rows[0] ? toItemRecord(rows[0]) : null;
}

/** Returns false when an item with that id already exists, e.g. a retried request */
export async function insertItem(
  values: {
    id?: typeof shoppingItem.$inferInsert.id;
    listId: typeof shoppingItem.$inferInsert.listId;
    name: typeof shoppingItem.$inferInsert.name;
    quantity: typeof shoppingItem.$inferInsert.quantity;
    addedById: typeof shoppingItem.$inferInsert.addedById;
  },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(shoppingItem)
    .values(values)
    .onConflictDoNothing({ target: shoppingItem.id })
    .returning({ id: shoppingItem.id });
  return rows.length > 0;
}

/** Returns the item's name after the change, or null when the list has no item with that id */
export async function updateItem(
  ref: { listId: string; itemId: string },
  changes: ItemChanges,
  executor: Executor = db,
): Promise<{ name: string } | null> {
  const rows = await executor
    .update(shoppingItem)
    .set(changes)
    .where(and(eq(shoppingItem.id, ref.itemId), eq(shoppingItem.listId, ref.listId)))
    .returning({ name: shoppingItem.name });
  return rows[0] ?? null;
}

/** Returns false when the list has no item with that id */
export async function deleteItem(
  ref: { listId: string; itemId: string },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .delete(shoppingItem)
    .where(and(eq(shoppingItem.id, ref.itemId), eq(shoppingItem.listId, ref.listId)))
    .returning({ id: shoppingItem.id });
  return rows.length > 0;
}

/** Returns how many items were removed */
export async function deleteCheckedItems(listId: string, executor: Executor = db): Promise<number> {
  const rows = await executor
    .delete(shoppingItem)
    .where(and(eq(shoppingItem.listId, listId), isNotNull(shoppingItem.checkedAt)))
    .returning({ id: shoppingItem.id });
  return rows.length;
}

/**
 * Records that an item was bought. Ticking it again keeps the first time, but follows a new name.
 * Item ids are chosen by clients, so a row from another household with the same id is left alone.
 */
export async function recordPurchase(
  ref: { householdId: string; itemId: string },
  values: { name: string; boughtAt: Temporal.Instant },
  executor: Executor = db,
): Promise<void> {
  await executor
    .insert(shoppingPurchase)
    .values({ id: ref.itemId, householdId: ref.householdId, ...values })
    .onConflictDoUpdate({
      target: shoppingPurchase.id,
      set: { name: values.name },
      setWhere: eq(shoppingPurchase.householdId, ref.householdId),
    });
}

/** Unticking an item takes back its purchase */
export async function forgetPurchase(
  ref: { householdId: string; itemId: string },
  executor: Executor = db,
): Promise<void> {
  await executor
    .delete(shoppingPurchase)
    .where(
      and(eq(shoppingPurchase.id, ref.itemId), eq(shoppingPurchase.householdId, ref.householdId)),
    );
}

/** Renaming a ticked item renames its purchase, so a typo fixed in the cart is fixed in history too */
export async function renamePurchase(
  ref: { householdId: string; itemId: string },
  name: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(shoppingPurchase)
    .set({ name })
    .where(
      and(eq(shoppingPurchase.id, ref.itemId), eq(shoppingPurchase.householdId, ref.householdId)),
    );
}

/**
 * Everything bought since `since`, one entry per name (ignoring case), spelled the way it was
 * last bought. Two of the same on one day count as one trip. Most trips first.
 */
export async function findPurchaseHistory(
  householdId: string,
  { since, limit }: { since: Temporal.Instant; limit: number },
  executor: Executor = db,
): Promise<BoughtItem[]> {
  const key = sql`lower(${shoppingPurchase.name})`;
  const lastBoughtAt = sql`max(${shoppingPurchase.boughtAt})`.mapWith(shoppingPurchase.boughtAt);
  const trips = sql<number>`count(distinct ${shoppingPurchase.boughtAt}::date)`.mapWith(Number);
  const rows = await executor
    .select({
      name: sql<string>`(array_agg(${shoppingPurchase.name} order by ${shoppingPurchase.boughtAt} desc))[1]`,
      trips,
      firstBoughtAt: sql`min(${shoppingPurchase.boughtAt})`.mapWith(shoppingPurchase.boughtAt),
      lastBoughtAt,
    })
    .from(shoppingPurchase)
    .where(
      and(eq(shoppingPurchase.householdId, householdId), gte(shoppingPurchase.boughtAt, since)),
    )
    .groupBy(key)
    .orderBy(desc(trips), desc(lastBoughtAt))
    .limit(limit);
  return rows;
}

export async function countLists(householdId: string, executor: Executor = db): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(shoppingList)
    .where(eq(shoppingList.householdId, householdId));
  return rows[0]?.total ?? 0;
}

export async function countItems(listId: string, executor: Executor = db): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(shoppingItem)
    .where(eq(shoppingItem.listId, listId));
  return rows[0]?.total ?? 0;
}
