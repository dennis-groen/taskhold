// Business rules for shopping lists. Every member of a household can see and change all of its
// lists; nobody else can, and a list from another household looks the same as one that doesn't exist.
import * as householdsService from "../households/households.service.ts";
import * as shoppingDal from "./shopping.dal.ts";
import { itemIdTaken, itemNotFound, listNotFound } from "./shopping.errors.ts";
import type { ShoppingItem, ShoppingList, ShoppingListSummary } from "./shopping.types.ts";

export async function getLists(userId: string): Promise<ShoppingListSummary[]> {
  const household = await householdsService.getMembershipOf(userId);
  return shoppingDal.findListsByHousehold(household.id);
}

export async function createList(userId: string, name: string): Promise<ShoppingList> {
  const household = await householdsService.getMembershipOf(userId);
  const { id } = await shoppingDal.insertList({ householdId: household.id, name });
  return { id, name, items: [] };
}

export async function getList(userId: string, listId: string): Promise<ShoppingList> {
  const list = await findListOf(userId, listId);
  const items = await shoppingDal.findItems(list.id);
  return { id: list.id, name: list.name, items: items.map(toItem) };
}

export async function renameList(userId: string, listId: string, name: string): Promise<void> {
  const household = await householdsService.getMembershipOf(userId);
  const renamed = await shoppingDal.renameList({ householdId: household.id, listId }, name);
  if (!renamed) throw listNotFound();
}

export async function deleteList(userId: string, listId: string): Promise<void> {
  const household = await householdsService.getMembershipOf(userId);
  const deleted = await shoppingDal.deleteList({ householdId: household.id, listId });
  if (!deleted) throw listNotFound();
}

export async function addItem(
  userId: string,
  listId: string,
  input: { id?: string; name: string; quantity?: string | null },
): Promise<ShoppingItem> {
  const list = await findListOf(userId, listId);
  const id = input.id ?? crypto.randomUUID();
  const inserted = await shoppingDal.insertItem({
    id,
    listId: list.id,
    name: input.name,
    quantity: input.quantity ?? null,
    addedById: userId,
  });

  // Not inserted: either a retry of an add that already went through, or someone else's id
  const item = await shoppingDal.findItem({ listId: list.id, itemId: id });
  if (!item) throw inserted ? itemNotFound() : itemIdTaken();
  return toItem(item);
}

export async function updateItem(
  userId: string,
  ref: { listId: string; itemId: string },
  changes: { name?: string; quantity?: string | null; checked?: boolean },
): Promise<ShoppingItem> {
  const list = await findListOf(userId, ref.listId);
  const itemRef = { listId: list.id, itemId: ref.itemId };

  const updated = await shoppingDal.updateItem(itemRef, {
    name: changes.name,
    quantity: changes.quantity,
    // Checking records who and when; unchecking clears both
    ...(changes.checked !== undefined && {
      checkedAt: changes.checked ? new Date() : null,
      checkedById: changes.checked ? userId : null,
    }),
  });
  if (!updated) throw itemNotFound();

  const item = await shoppingDal.findItem(itemRef);
  if (!item) throw itemNotFound();
  return toItem(item);
}

/** Deleting an item that's already gone succeeds, so two people removing it at once both see it go */
export async function deleteItem(
  userId: string,
  ref: { listId: string; itemId: string },
): Promise<void> {
  const list = await findListOf(userId, ref.listId);
  await shoppingDal.deleteItem({ listId: list.id, itemId: ref.itemId });
}

/** Removes everything that's been checked off. Returns how many items went. */
export async function clearCheckedItems(userId: string, listId: string): Promise<number> {
  const list = await findListOf(userId, listId);
  return shoppingDal.deleteCheckedItems(list.id);
}

async function findListOf(userId: string, listId: string) {
  const household = await householdsService.getMembershipOf(userId);
  const list = await shoppingDal.findList({ householdId: household.id, listId });
  if (!list) throw listNotFound();
  return list;
}

function toItem(record: shoppingDal.ItemRecord): ShoppingItem {
  return { ...record, checked: record.checkedAt !== null };
}
