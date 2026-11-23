// Data access for shopping lists: the only place that queries shopping tables.
// Every list query is scoped to a household, so a list id from another household reads as missing.
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type Executor } from "../../db/db.ts";
import { user } from "../auth/auth.table.ts";
import { shoppingItem, shoppingList, shoppingPurchase, shoppingTrip } from "./shopping.table.ts";
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

/** Returns false when a list with that id already exists, e.g. a retried request */
export async function insertList(
  values: Pick<typeof shoppingList.$inferInsert, "id" | "householdId" | "name">,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(shoppingList)
    .values(values)
    .onConflictDoNothing({ target: shoppingList.id })
    .returning({ id: shoppingList.id });
  return rows.length > 0;
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

export type PurchaseHistoryRow = Omit<BoughtItem, "pairedWith">;

/** Returns the item's name and quantity after the change, or null when missing */
export async function updateItem(
  ref: { listId: string; itemId: string },
  changes: ItemChanges,
  executor: Executor = db,
): Promise<{ name: string; quantity: string | null } | null> {
  const rows = await executor
    .update(shoppingItem)
    .set(changes)
    .where(and(eq(shoppingItem.id, ref.itemId), eq(shoppingItem.listId, ref.listId)))
    .returning({ name: shoppingItem.name, quantity: shoppingItem.quantity });
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
 * Records that an item was bought. Ticking it again keeps the first time, but follows a new name,
 * quantity or list. Item ids are chosen by clients, so a row from another household with the same
 * id is left alone.
 */
export async function recordPurchase(
  ref: { householdId: string; listId: string; itemId: string },
  values: { name: string; quantity: string | null; boughtAt: Temporal.Instant },
  executor: Executor = db,
): Promise<void> {
  await executor
    .insert(shoppingPurchase)
    .values({ id: ref.itemId, householdId: ref.householdId, listId: ref.listId, ...values })
    .onConflictDoUpdate({
      target: shoppingPurchase.id,
      set: { listId: ref.listId, name: values.name, quantity: values.quantity },
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

/** Editing a ticked item updates its purchase, so a typo or quantity fix carries into history */
export async function updatePurchase(
  ref: { householdId: string; itemId: string },
  values: { name: string; quantity: string | null },
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(shoppingPurchase)
    .set(values)
    .where(
      and(eq(shoppingPurchase.id, ref.itemId), eq(shoppingPurchase.householdId, ref.householdId)),
    );
}

/** Removes all purchase history rows matching any of `names` (case-insensitive) for this household */
export async function forgetPurchasesByName(
  householdId: string,
  names: readonly string[],
  executor: Executor = db,
): Promise<number> {
  const lowered = [...new Set(names.map((name) => name.toLowerCase()))];
  if (lowered.length === 0) return 0;
  const rows = await executor
    .delete(shoppingPurchase)
    .where(
      and(
        eq(shoppingPurchase.householdId, householdId),
        inArray(sql`lower(${shoppingPurchase.name})`, lowered),
      ),
    )
    .returning({ id: shoppingPurchase.id });
  return rows.length;
}

/**
 * Everything bought since `since`, one entry per name (ignoring case), spelled the way it was
 * last bought, with its usual quantity and the lists it was bought on. Two of the same on one day
 * count as one trip. Most trips first.
 */
export async function findPurchaseHistory(
  householdId: string,
  { since, limit }: { since: Temporal.Instant; limit: number },
  executor: Executor = db,
): Promise<PurchaseHistoryRow[]> {
  const key = sql`lower(${shoppingPurchase.name})`;
  const lastBoughtAt = sql`max(${shoppingPurchase.boughtAt})`.mapWith(shoppingPurchase.boughtAt);
  const trips = sql<number>`count(distinct ${shoppingPurchase.boughtAt}::date)`.mapWith(Number);
  const rows = await executor
    .select({
      name: sql<string>`(array_agg(${shoppingPurchase.name} order by ${shoppingPurchase.boughtAt} desc))[1]`,
      // Most common quantity across buys, counting no-quantity as '' so one occasional amount
      // doesn't override usually buying it without one
      quantity: sql<
        string | null
      >`nullif(mode() within group (order by coalesce(${shoppingPurchase.quantity}, '')), '')`,
      trips,
      firstBoughtAt: sql`min(${shoppingPurchase.boughtAt})`.mapWith(shoppingPurchase.boughtAt),
      lastBoughtAt,
      listIds: sql<
        string[]
      >`coalesce(array_agg(distinct ${shoppingPurchase.listId}) filter (where ${shoppingPurchase.listId} is not null), array[]::text[])`,
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

/** Distinct (lowercased item name, calendar day) pairs since `since`, for co-purchase detection */
export async function findPurchaseTripDays(
  householdId: string,
  { since }: { since: Temporal.Instant },
  executor: Executor = db,
): Promise<{ item: string; day: string }[]> {
  return executor
    .selectDistinct({
      item: sql<string>`lower(${shoppingPurchase.name})`,
      day: sql<string>`${shoppingPurchase.boughtAt}::date::text`,
    })
    .from(shoppingPurchase)
    .where(
      and(eq(shoppingPurchase.householdId, householdId), gte(shoppingPurchase.boughtAt, since)),
    );
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

/** Locks the list row until the transaction ends, so two people starting a trip take turns */
export async function lockList(
  ref: { householdId: string; listId: string },
  executor: Executor,
): Promise<{ id: string; name: string } | null> {
  const rows = await executor
    .select({ id: shoppingList.id, name: shoppingList.name })
    .from(shoppingList)
    .where(and(eq(shoppingList.id, ref.listId), eq(shoppingList.householdId, ref.householdId)))
    .limit(1)
    .for("update");
  return rows[0] ?? null;
}

export type RunningTrip = {
  id: string;
  startedAt: Temporal.Instant;
  shopper: { id: string; name: string } | null;
};

/** The trip on the list that hasn't ended and started at or after `since`, if any */
export async function findRunningTrip(
  listId: string,
  since: Temporal.Instant,
  executor: Executor = db,
): Promise<RunningTrip | null> {
  const rows = await executor
    .select({
      id: shoppingTrip.id,
      startedAt: shoppingTrip.startedAt,
      shopperId: user.id,
      shopperName: user.name,
    })
    .from(shoppingTrip)
    .leftJoin(user, eq(user.id, shoppingTrip.shopperId))
    .where(
      and(
        eq(shoppingTrip.listId, listId),
        isNull(shoppingTrip.endedAt),
        gte(shoppingTrip.startedAt, since),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    startedAt: row.startedAt,
    shopper: row.shopperId !== null ? { id: row.shopperId, name: row.shopperName ?? "" } : null,
  };
}

/** Ends the list's running trips, optionally only one person's or ones that started before a time. Returns how many. */
export async function endTrips(
  listId: string,
  at: Temporal.Instant,
  filter: { shopperId?: string; startedBefore?: Temporal.Instant } = {},
  executor: Executor = db,
): Promise<number> {
  const rows = await executor
    .update(shoppingTrip)
    .set({ endedAt: at })
    .where(
      and(
        eq(shoppingTrip.listId, listId),
        isNull(shoppingTrip.endedAt),
        filter.shopperId !== undefined ? eq(shoppingTrip.shopperId, filter.shopperId) : undefined,
        filter.startedBefore !== undefined
          ? lt(shoppingTrip.startedAt, filter.startedBefore)
          : undefined,
      ),
    )
    .returning({ id: shoppingTrip.id });
  return rows.length;
}

/** Returns true when the trip was inserted, false when its id was already taken */
export async function insertTrip(
  values: Pick<
    typeof shoppingTrip.$inferInsert,
    "id" | "householdId" | "listId" | "shopperId" | "notified"
  >,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(shoppingTrip)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: shoppingTrip.id });
  return rows.length > 0;
}

export async function findTripById(
  id: string,
  executor: Executor = db,
): Promise<(RunningTrip & { listId: string; householdId: string }) | null> {
  const rows = await executor
    .select({
      id: shoppingTrip.id,
      listId: shoppingTrip.listId,
      householdId: shoppingTrip.householdId,
      startedAt: shoppingTrip.startedAt,
      shopperId: user.id,
      shopperName: user.name,
    })
    .from(shoppingTrip)
    .leftJoin(user, eq(user.id, shoppingTrip.shopperId))
    .where(eq(shoppingTrip.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    listId: row.listId,
    householdId: row.householdId,
    startedAt: row.startedAt,
    shopper: row.shopperId !== null ? { id: row.shopperId, name: row.shopperName ?? "" } : null,
  };
}

/** Whether a trip on the list that started at or after `since` sent notifications */
export async function wasNotifiedSince(
  listId: string,
  since: Temporal.Instant,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .select({ id: shoppingTrip.id })
    .from(shoppingTrip)
    .where(
      and(
        eq(shoppingTrip.listId, listId),
        eq(shoppingTrip.notified, true),
        gte(shoppingTrip.startedAt, since),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
