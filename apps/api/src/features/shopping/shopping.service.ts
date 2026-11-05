// Business rules for shopping lists. Every member of a household can see and change all of its
// lists; nobody else can, and a list from another household looks the same as one that doesn't exist.
import { announce } from "../../lib/live-changes.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as householdsService from "../households/households.service.ts";
import * as shoppingRepo from "./shopping.repo.ts";
import { itemIdTaken, itemNotFound, listNotFound } from "./shopping.errors.ts";
import type {
  AddItemInput,
  ShoppingItem,
  ShoppingList,
  ShoppingListSummary,
  UpdateItemInput,
} from "./shopping.schema.ts";

export async function getLists(userId: string): Promise<ShoppingListSummary[]> {
  const household = await householdsService.getMembershipOf(userId);
  return shoppingRepo.findListsByHousehold(household.id);
}

export async function createList(userId: string, name: string): Promise<ShoppingList> {
  const household = await householdsService.getMembershipOf(userId);
  const { id } = await shoppingRepo.insertList({ householdId: household.id, name });
  annotate("shopping", { list_id: id });
  await changed(household.id);
  return { id, name, items: [] };
}

export async function getList(userId: string, listId: string): Promise<ShoppingList> {
  const { list } = await findListOf(userId, listId);
  const items = await shoppingRepo.findItems(list.id);
  annotate("shopping", { item_count: items.length });
  return { id: list.id, name: list.name, items: items.map(toItem) };
}

export async function renameList(userId: string, listId: string, name: string): Promise<void> {
  annotate("shopping", { list_id: listId });
  const household = await householdsService.getMembershipOf(userId);
  const renamed = await shoppingRepo.renameList({ householdId: household.id, listId }, name);
  if (!renamed) throw listNotFound();
  await changed(household.id);
}

export async function deleteList(userId: string, listId: string): Promise<void> {
  annotate("shopping", { list_id: listId });
  const household = await householdsService.getMembershipOf(userId);
  const deleted = await shoppingRepo.deleteList({ householdId: household.id, listId });
  if (!deleted) throw listNotFound();
  await changed(household.id);
}

export async function addItem(
  userId: string,
  listId: string,
  input: AddItemInput,
): Promise<ShoppingItem> {
  const { list, householdId } = await findListOf(userId, listId);
  const id = input.id ?? crypto.randomUUID();
  annotate("shopping", { item_id: id });
  const inserted = await shoppingRepo.insertItem({
    id,
    listId: list.id,
    name: input.name,
    quantity: input.quantity ?? null,
    addedById: userId,
  });

  // Not inserted: either a retry of an add that already went through, or someone else's id
  const item = await shoppingRepo.findItem({ listId: list.id, itemId: id });
  if (!item) throw inserted ? itemNotFound() : itemIdTaken();
  if (inserted) await changed(householdId);
  return toItem(item);
}

export async function updateItem(
  userId: string,
  ref: { listId: string; itemId: string },
  changes: UpdateItemInput,
): Promise<ShoppingItem> {
  const { list, householdId } = await findListOf(userId, ref.listId);
  const itemRef = { listId: list.id, itemId: ref.itemId };
  annotate("shopping", { item_id: ref.itemId, checked: changes.checked });

  const updated = await shoppingRepo.updateItem(itemRef, {
    name: changes.name,
    quantity: changes.quantity,
    // Checking records who and when; unchecking clears both
    ...(changes.checked !== undefined && {
      checkedAt: changes.checked ? Temporal.Now.instant() : null,
      checkedById: changes.checked ? userId : null,
    }),
  });
  if (!updated) throw itemNotFound();
  await changed(householdId);

  const item = await shoppingRepo.findItem(itemRef);
  if (!item) throw itemNotFound();
  return toItem(item);
}

/** Deleting an item that's already gone succeeds, so two people removing it at once both see it go */
export async function deleteItem(
  userId: string,
  ref: { listId: string; itemId: string },
): Promise<void> {
  const { list, householdId } = await findListOf(userId, ref.listId);
  annotate("shopping", { item_id: ref.itemId });
  await shoppingRepo.deleteItem({ listId: list.id, itemId: ref.itemId });
  await changed(householdId);
}

/** Removes everything that's been checked off. Returns how many items went. */
export async function clearCheckedItems(userId: string, listId: string): Promise<number> {
  const { list, householdId } = await findListOf(userId, listId);
  const removed = await shoppingRepo.deleteCheckedItems(list.id);
  annotate("shopping", { removed_count: removed });
  if (removed > 0) await changed(householdId);
  return removed;
}

async function findListOf(userId: string, listId: string) {
  annotate("shopping", { list_id: listId });
  const household = await householdsService.getMembershipOf(userId);
  const list = await shoppingRepo.findList({ householdId: household.id, listId });
  if (!list) throw listNotFound();
  return { list, householdId: household.id };
}

/** Tells everyone in the household that its shopping lists changed */
function changed(householdId: string) {
  return announce({ householdId, topic: "shopping" });
}

function toItem(record: shoppingRepo.ItemRecord): ShoppingItem {
  return { ...record, checked: record.checkedAt !== null };
}
