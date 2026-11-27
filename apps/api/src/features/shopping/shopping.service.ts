// Business rules for shopping lists. Every member of a household can see and change all of its
// lists; nobody else can, and a list from another household looks the same as one that doesn't exist.
import type { Executor } from "../../db/db.ts";
import { logger } from "../../lib/logger.ts";
import { sendPush, type SendPush } from "../../lib/push.ts";
import { annotate, describeError } from "../../lib/wide-event.ts";
import * as householdsService from "../households/households.service.ts";
import type { HouseholdScope } from "../households/households.service.ts";
import * as remindersService from "../reminders/reminders.service.ts";
import { buildPurchasePairs } from "./purchase-pairs.ts";
import * as shoppingRepo from "./shopping.repo.ts";
import {
  itemIdTaken,
  itemLimitReached,
  itemNotFound,
  listIdTaken,
  listLimitReached,
  listNotFound,
  tripIdTaken,
} from "./shopping.errors.ts";
import type {
  AddItemInput,
  BoughtItem,
  CreateListInput,
  ShoppingItem,
  ShoppingList,
  ShoppingListSummary,
  ShoppingTrip,
  UpdateItemInput,
} from "./shopping.schema.ts";

// Far above what a household uses; they keep one account from filling the shared database
const MAX_LISTS = 50;
const MAX_ITEMS_PER_LIST = 500;

// A trip nobody ends stops showing after this long
const TRIP_LASTS = Temporal.Duration.from({ hours: 2 });
// Starting again within this long of a trip that notified doesn't notify again
const QUIET_AFTER_PING = Temporal.Duration.from({ minutes: 30 });

/** Every write to a household's shopping lists goes through here (see householdWrites) */
const writeShopping = householdsService.householdWrites("shopping");

export async function getLists(userId: string): Promise<ShoppingListSummary[]> {
  const household = await householdsService.getMembershipOf(userId);
  return shoppingRepo.findListsByHousehold(household.id);
}

export function createList(userId: string, input: CreateListInput): Promise<ShoppingList> {
  const id = input.id ?? crypto.randomUUID();
  annotate("shopping", { list_id: id });
  return writeShopping(userId, async (scope) => {
    const { householdId, tx } = scope;
    const ref = { householdId, listId: id };

    // A retry of a create that already got in answers with that list, whatever has changed since
    const existing = input.id ? await shoppingRepo.findList(ref, tx) : null;
    if (existing) {
      annotate("shopping", { retried: true });
      return loadList(existing, tx);
    }

    if ((await shoppingRepo.countLists(householdId, tx)) >= MAX_LISTS) throw listLimitReached();
    const inserted = await shoppingRepo.insertList({ id, householdId, name: input.name }, tx);
    if (inserted) {
      scope.changed();
      return { id, name: input.name, items: [], trip: null };
    }
    // Not inserted: a retry that raced its twin, or an id that belongs to another household
    const raced = await shoppingRepo.findList(ref, tx);
    if (raced) return loadList(raced, tx);
    throw listIdTaken();
  });
}

export async function getList(userId: string, listId: string): Promise<ShoppingList> {
  annotate("shopping", { list_id: listId });
  const household = await householdsService.getMembershipOf(userId);
  const list = await shoppingRepo.findList({ householdId: household.id, listId });
  if (!list) throw listNotFound();
  return loadList(list);
}

export async function renameList(userId: string, listId: string, name: string): Promise<void> {
  annotate("shopping", { list_id: listId });
  await writeShopping(userId, async (scope) => {
    const ref = { householdId: scope.householdId, listId };
    if (!(await shoppingRepo.renameList(ref, name, scope.tx))) throw listNotFound();
    scope.changed();
  });
}

/**
 * Deleting a list that's already gone, or isn't the household's, does nothing, so a delete sent
 * twice answers the same both times
 */
export async function deleteList(userId: string, listId: string): Promise<void> {
  annotate("shopping", { list_id: listId });
  await writeShopping(userId, async (scope) => {
    const ref = { householdId: scope.householdId, listId };
    if (await shoppingRepo.deleteList(ref, scope.tx)) scope.changed();
  });
}

export function addItem(
  userId: string,
  listId: string,
  input: AddItemInput,
): Promise<ShoppingItem> {
  return writeShopping(userId, async (scope) => {
    const { tx } = scope;
    const list = await findListIn(scope, listId);
    const id = input.id ?? crypto.randomUUID();
    annotate("shopping", { item_id: id });
    // A retry of an add that already got in must still succeed, so only a new item counts
    const isNew = !(await shoppingRepo.findItem({ listId: list.id, itemId: id }, tx));
    if (isNew && (await shoppingRepo.countItems(list.id, tx)) >= MAX_ITEMS_PER_LIST) {
      throw itemLimitReached();
    }
    const inserted = await shoppingRepo.insertItem(
      {
        id,
        listId: list.id,
        name: input.name,
        quantity: input.quantity ?? null,
        addedById: userId,
      },
      tx,
    );

    // Not inserted: either a retry of an add that already went through, or someone else's id
    const item = await shoppingRepo.findItem({ listId: list.id, itemId: id }, tx);
    if (!item) throw inserted ? itemNotFound() : itemIdTaken();
    if (inserted) scope.changed();
    return toItem(item);
  });
}

export function updateItem(
  userId: string,
  ref: { listId: string; itemId: string },
  changes: UpdateItemInput,
): Promise<ShoppingItem> {
  annotate("shopping", { item_id: ref.itemId, checked: changes.checked });
  return writeShopping(userId, async (scope) => {
    const { householdId, tx } = scope;
    const list = await findListIn(scope, ref.listId);
    const itemRef = { listId: list.id, itemId: ref.itemId };
    const purchaseRef = { householdId, itemId: ref.itemId };
    const checkedAt = Temporal.Now.instant();
    const updated = await shoppingRepo.updateItem(
      itemRef,
      {
        name: changes.name,
        quantity: changes.quantity,
        // Checking records who and when; unchecking clears both
        ...(changes.checked !== undefined && {
          checkedAt: changes.checked ? checkedAt : null,
          checkedById: changes.checked ? userId : null,
        }),
      },
      tx,
    );
    if (!updated) throw itemNotFound();

    // Ticking it off is what counts as buying it, for "buy again"
    if (changes.checked === true) {
      await shoppingRepo.recordPurchase(
        { ...purchaseRef, listId: list.id },
        { name: updated.name, quantity: updated.quantity, boughtAt: checkedAt },
        tx,
      );
    } else if (changes.checked === false) {
      await shoppingRepo.forgetPurchase(purchaseRef, tx);
    } else if (changes.name !== undefined || changes.quantity !== undefined) {
      await shoppingRepo.updatePurchase(
        purchaseRef,
        { name: updated.name, quantity: updated.quantity },
        tx,
      );
    }
    scope.changed();

    const item = await shoppingRepo.findItem(itemRef, tx);
    if (!item) throw itemNotFound();
    return toItem(item);
  });
}

/** Deleting an item that's already gone succeeds, so two people removing it at once both see it go */
export async function deleteItem(
  userId: string,
  ref: { listId: string; itemId: string },
): Promise<void> {
  annotate("shopping", { item_id: ref.itemId });
  await writeShopping(userId, async (scope) => {
    const list = await findListIn(scope, ref.listId);
    await shoppingRepo.deleteItem({ listId: list.id, itemId: ref.itemId }, scope.tx);
    // Announced even when it was already gone: the other device may have missed that
    scope.changed();
  });
}

/** Removes everything that's been checked off. Returns how many items went. */
export function clearCheckedItems(userId: string, listId: string): Promise<number> {
  return writeShopping(userId, async (scope) => {
    const { tx } = scope;
    const list = await findListIn(scope, listId);
    const removed = await shoppingRepo.deleteCheckedItems(list.id, tx);
    // Only the caller's own trip ends: someone at home clearing ticked items mustn't end the shopper's
    const tripsEnded = await shoppingRepo.endTrips(
      list.id,
      Temporal.Now.instant(),
      { shopperId: userId },
      tx,
    );
    annotate("shopping", { removed_count: removed });
    if (removed > 0 || tripsEnded > 0) scope.changed();
    return removed;
  });
}

/**
 * Tells the household the person is going shopping for this list. Returns the trip now running:
 * if someone else is already out, that is theirs, and nobody is told again.
 */
export async function startTrip(
  userId: string,
  listId: string,
  input: { id: string },
  send: SendPush = sendPush,
): Promise<ShoppingTrip> {
  annotate("shopping", { trip_id: input.id });
  const now = Temporal.Now.instant();
  const since = now.subtract(TRIP_LASTS);

  const outcome = await writeShopping(userId, async (scope) => {
    const { householdId, tx } = scope;
    const list = await findListIn(scope, listId);
    const base = { list, householdId, notify: false };

    // A retry of a start that already got in answers with the trip as it is now, and tells no one
    const existing = await shoppingRepo.findTripById(input.id, tx);
    if (existing) {
      if (existing.householdId !== householdId || existing.listId !== list.id) throw tripIdTaken();
      annotate("shopping", { retried: true });
      const running = await shoppingRepo.findRunningTrip(list.id, since, tx);
      const { id, shopper, startedAt } = existing;
      return { ...base, started: running ?? { id, shopper, startedAt } };
    }

    await shoppingRepo.lockList({ householdId, listId: list.id }, tx);
    // Close forgotten trips, so the one-running-per-list index lets a new one in
    await shoppingRepo.endTrips(list.id, now, { startedBefore: since }, tx);
    const running = await shoppingRepo.findRunningTrip(list.id, since, tx);
    if (running) return { ...base, started: running };

    const shouldNotify = !(await shoppingRepo.wasNotifiedSince(
      list.id,
      now.subtract(QUIET_AFTER_PING),
      tx,
    ));
    await shoppingRepo.insertTrip(
      { id: input.id, householdId, listId: list.id, shopperId: userId, notified: shouldNotify },
      tx,
    );
    scope.changed();
    const trip = await shoppingRepo.findRunningTrip(list.id, since, tx);
    return { ...base, notify: shouldNotify, started: trip };
  });
  const { list, householdId, notify, started } = outcome;
  if (!started) throw tripIdTaken();

  let notified = 0;
  if (notify) {
    const first = firstName(started.shopper?.name);
    try {
      notified = await remindersService.tellHousemates(
        {
          householdId,
          exceptUserId: userId,
          message: {
            title: `${first} is going shopping`,
            body: `Need anything? Add it to ${list.name}.`,
            url: `/lists/${list.id}`,
            tag: `shopping-trip-${list.id}`,
          },
        },
        send,
      );
    } catch (err) {
      // The trip has started even if a push service is down
      logger.warn(
        { component: "shopping", list_id: list.id, error: describeError(err) },
        "Couldn't tell the household about a shopping trip",
      );
    }
  }
  annotate("shopping", { notified: notify, housemates_notified: notified });
  return started;
}

/** Ends the list's trip, whoever started it. Ending one that's already gone succeeds. */
export async function endTrip(userId: string, listId: string): Promise<void> {
  await writeShopping(userId, async (scope) => {
    const list = await findListIn(scope, listId);
    const ended = await shoppingRepo.endTrips(list.id, Temporal.Now.instant(), {}, scope.tx);
    annotate("shopping", { trips_ended: ended });
    if (ended > 0) scope.changed();
  });
}

/** How far back "buy again" looks, and how many names it sends at most */
const HISTORY_DAYS = 365;
const HISTORY_LIMIT = 300;

/**
 * Everything the household has bought in the last year, one entry per name. The app ranks it
 * itself, so suggestions follow what's on the list and what's typed, offline too.
 */
export async function getPurchaseHistory(userId: string): Promise<BoughtItem[]> {
  const household = await householdsService.getMembershipOf(userId);
  const since = Temporal.Now.instant().subtract({ hours: 24 * HISTORY_DAYS });
  const rows = await shoppingRepo.findPurchaseHistory(household.id, {
    since,
    limit: HISTORY_LIMIT,
  });
  const pairs =
    rows.length >= 2
      ? buildPurchasePairs(
          await shoppingRepo.findPurchaseTripDays(household.id, { since }),
          new Map(rows.map((row) => [row.name.toLowerCase(), row.name])),
        )
      : new Map<string, string[]>();
  const items: BoughtItem[] = rows.map((row) => ({
    ...row,
    pairedWith: pairs.get(row.name.toLowerCase()) ?? [],
  }));
  annotate("shopping", { history_count: items.length });
  return items;
}

/** Removes items from the household's "buy again" history so they stop being suggested */
export function forgetPurchaseHistory(userId: string, names: readonly string[]): Promise<number> {
  return writeShopping(userId, async (scope) => {
    const removed = await shoppingRepo.forgetPurchasesByName(scope.householdId, names, scope.tx);
    annotate("shopping", { forgotten_count: removed });
    if (removed > 0) scope.changed();
    return removed;
  });
}

/** The household's list, inside a write */
async function findListIn(scope: HouseholdScope, listId: string) {
  annotate("shopping", { list_id: listId });
  const list = await shoppingRepo.findList({ householdId: scope.householdId, listId }, scope.tx);
  if (!list) throw listNotFound();
  return list;
}

/** A list with its items and the trip running for it, if any */
async function loadList(
  list: { id: string; name: string },
  executor?: Executor,
): Promise<ShoppingList> {
  const items = await shoppingRepo.findItems(list.id, executor);
  const trip = await shoppingRepo.findRunningTrip(
    list.id,
    Temporal.Now.instant().subtract(TRIP_LASTS),
    executor,
  );
  annotate("shopping", { item_count: items.length });
  return { id: list.id, name: list.name, items: items.map(toItem), trip };
}

function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Someone";
}

function toItem(record: shoppingRepo.ItemRecord): ShoppingItem {
  return { ...record, checked: record.checkedAt !== null };
}
