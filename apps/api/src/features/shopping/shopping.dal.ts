// Data access for shopping lists: the only place that queries shopping tables.
// Every list query is scoped to a household, so a list id from another household reads as missing.
import { and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type Executor } from "../../db/client.ts";
import { user } from "../auth/auth.schema.ts";
import { shoppingItem, shoppingList } from "./shopping.schema.ts";

export type ListSummaryRecord = {
  id: string;
  name: string;
  itemCount: number;
  openCount: number;
};

export type ItemRecord = {
  id: string;
  name: string;
  quantity: string | null;
  addedBy: { id: string; name: string } | null;
  checkedBy: { id: string; name: string } | null;
  checkedAt: Date | null;
  createdAt: Date;
};

export type ItemChanges = {
  name?: string;
  quantity?: string | null;
  checkedAt?: Date | null;
  checkedById?: string | null;
};

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
  values: { householdId: string; name: string },
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
    id?: string;
    listId: string;
    name: string;
    quantity: string | null;
    addedById: string;
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

/** Returns false when the list has no item with that id */
export async function updateItem(
  ref: { listId: string; itemId: string },
  changes: ItemChanges,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(shoppingItem)
    .set(changes)
    .where(and(eq(shoppingItem.id, ref.itemId), eq(shoppingItem.listId, ref.listId)))
    .returning({ id: shoppingItem.id });
  return rows.length > 0;
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
