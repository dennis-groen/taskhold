// Every change people make to the household's lists and their items (see lib/offline-changes.ts). Everything a change
// needs travels in its variables, which are saved with it on the device; their shape is part of
// what a phone may still have waiting, so change it only with care.
import { defineChange } from "@/lib/offline-changes.ts";
import type { PersonSummary } from "@/lib/shared-with.ts";

import { itemKey } from "./item-entry.ts";
import {
  addItem,
  clearCheckedItems,
  createList,
  deleteItem,
  deleteList,
  forgetHistory,
  renameList,
  updateItem,
  type ShoppingItem,
  type ShoppingList,
  type ShoppingListSummary,
} from "./shopping.api.ts";
import { historyQuery, listQuery, listsQuery } from "./shopping.queries.ts";

export type ToggleItem = { listId: string; itemId: string; checked: boolean; by: PersonSummary };
export type ItemChanges = { name?: string; quantity?: string | null };
export type EditItem = { listId: string; itemId: string; changes: ItemChanges };
export type NewItem = {
  listId: string;
  id: string;
  name: string;
  quantity: string | null;
  by: PersonSummary;
};
type ItemRef = { listId: string; itemId: string };
export type NewList = { id: string; name: string };
export type RenameList = { listId: string; name: string };
type RestoreItems = { listId: string; items: ShoppingItem[] };

/** The household's lists, where making and deleting one shows */
const theLists = () => listsQuery().queryKey;

/** Every change to an item shows on the list it's on */
const onList = ({ listId }: { listId: string }) => listQuery(listId).queryKey;

/** Changes a list's items, leaving the rest of the list as it is */
function onItems<Vars>(change: (items: ShoppingItem[], vars: Vars) => ShoppingItem[]) {
  return (list: ShoppingList, vars: Vars): ShoppingList => ({
    ...list,
    items: change(list.items, vars),
  });
}

/** Updates one list's summary in the cached overview, leaving other lists untouched */
function updateSummary(
  lists: ShoppingListSummary[] | undefined,
  listId: string,
  change: (summary: ShoppingListSummary) => ShoppingListSummary,
): ShoppingListSummary[] | undefined {
  return lists?.map((summary) => (summary.id === listId ? change(summary) : summary));
}

/** Keeps the overview and sidebar counts in step with the updated list */
function syncCounts(
  lists: ShoppingListSummary[] | undefined,
  listId: string,
  list: ShoppingList,
): ShoppingListSummary[] | undefined {
  const itemCount = list.items.length;
  const openCount = list.items.filter((item) => !item.checked).length;
  return updateSummary(lists, listId, (summary) => ({ ...summary, itemCount, openCount }));
}

/** Adjusts overview counts when the list itself isn't cached (e.g. quick-adding from the overview) */
function shiftCounts(
  lists: ShoppingListSummary[] | undefined,
  listId: string,
  delta: { itemCount: number; openCount: number },
): ShoppingListSummary[] | undefined {
  return updateSummary(lists, listId, (summary) => ({
    ...summary,
    itemCount: Math.max(0, summary.itemCount + delta.itemCount),
    openCount: Math.max(0, summary.openCount + delta.openCount),
  }));
}

/** Keeps the overview counts in step after an item change, with an optional fallback when uncached */
function withListCounts(fallback?: { itemCount: number; openCount: number }) {
  return (
    lists: ShoppingListSummary[] | undefined,
    { listId }: { listId: string },
    after: ShoppingList | undefined,
  ) => {
    if (after) return syncCounts(lists, listId, after);
    return fallback ? shiftCounts(lists, listId, fallback) : lists;
  };
}

// Puts removed items back as they were, keeping their ids so open screens still match
const restore = defineChange("shopping", "restore", {
  idempotent: true,
  ordered: true,
  send: async ({ listId, items }: RestoreItems) => {
    for (const { id, name, quantity, checked } of items) {
      await addItem(listId, { id, name, quantity });
      if (checked) await updateItem(listId, id, { checked });
    }
  },
  target: onList,
  apply: onItems((current, { items: restored }) => [...restored, ...current]),
  also: (update) => [update(theLists, withListCounts())],
});

export const shoppingChanges = {
  // The id comes from the app, so the API ignores a second copy. Ordered, so the list is there
  // before the items added to it straight after.
  createList: defineChange("shopping", "create-list", {
    idempotent: true,
    ordered: true,
    send: ({ id, name }: NewList) => createList({ id, name }),
    target: theLists,
    describe: ({ name }) => `Made ${name}`,
    apply: (current: ShoppingListSummary[], { id, name }) => [
      ...current,
      { id, name, itemCount: 0, openCount: 0 },
    ],
    // The new list opens before the API has it, offline too
    also: (update) => [
      update(
        ({ id }) => listQuery(id).queryKey,
        (_current, { id, name }) => ({ id, name, items: [], trip: null }),
      ),
    ],
  }),

  // Renaming to the same name twice does the same as once
  renameList: defineChange("shopping", "rename-list", {
    idempotent: true,
    ordered: true,
    send: ({ listId, name }: RenameList) => renameList(listId, name),
    target: onList,
    describe: ({ name }) => `Renamed a list to ${name}`,
    apply: (current, { name }) => ({ ...current, name }),
    also: (update) => [
      update(theLists, (lists, { listId, name }) =>
        updateSummary(lists, listId, (list) => ({ ...list, name })),
      ),
    ],
  }),

  // A second delete does the same as the first, so this is kept across a restart. Ordered, so
  // changes made to the list before it went don't arrive after.
  deleteList: defineChange("shopping", "delete-list", {
    idempotent: true,
    ordered: true,
    send: ({ listId }: { listId: string }) => deleteList(listId),
    target: theLists,
    describe: () => "Deleted a list",
    apply: (current, { listId }) => current.filter((list) => list.id !== listId),
    also: (update) => [update(onList, () => undefined)],
  }),

  // Ordered, so a tick and its untick arrive as they were made, and never before the item's add
  toggle: defineChange("shopping", "toggle", {
    idempotent: true,
    ordered: true,
    send: ({ listId, itemId, checked }: ToggleItem) => updateItem(listId, itemId, { checked }),
    target: onList,
    describe: ({ itemId, checked }, list) =>
      `${checked ? "Ticked" : "Unticked"} ${list?.items.find((item) => item.id === itemId)?.name ?? "an item"}`,
    apply: onItems((current, { itemId, checked, by }) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              checked,
              checkedBy: checked ? by : null,
              checkedAt: checked ? Temporal.Now.instant().toString() : null,
            }
          : item,
      ),
    ),
    also: (update) => [update(theLists, withListCounts())],
  }),

  // Sends only the fields that changed, so a housemate's edit to the other one stays. Ordered, so
  // it can't arrive after its item was removed.
  edit: defineChange("shopping", "edit", {
    idempotent: true,
    ordered: true,
    send: ({ listId, itemId, changes }: EditItem) => updateItem(listId, itemId, changes),
    target: onList,
    describe: ({ itemId }, list) =>
      `Changed ${list?.items.find((item) => item.id === itemId)?.name ?? "an item"}`,
    apply: onItems((current, { itemId, changes }) =>
      current.map((item) => (item.id === itemId ? { ...item, ...changes } : item)),
    ),
  }),

  // The id comes from the app, so the API ignores a second copy. Ordered, so a tick or edit made
  // straight after can't arrive first.
  add: defineChange("shopping", "add", {
    idempotent: true,
    ordered: true,
    send: ({ listId, id, name, quantity }: NewItem) => addItem(listId, { id, name, quantity }),
    target: onList,
    describe: ({ name }) => `Added ${name}`,
    apply: onItems((current, { id, name, quantity, by }) => [
      {
        id,
        name,
        quantity,
        checked: false,
        addedBy: by,
        checkedBy: null,
        checkedAt: null,
        createdAt: Temporal.Now.instant().toString(),
      },
      ...current,
    ]),
    also: (update) => [update(theLists, withListCounts({ itemCount: 1, openCount: 1 }))],
  }),

  // A second delete fails, as the item is gone
  remove: defineChange("shopping", "remove", {
    idempotent: false,
    ordered: true,
    send: ({ listId, itemId }: ItemRef) => deleteItem(listId, itemId),
    target: onList,
    describe: () => "Removed an item",
    apply: onItems((current, { itemId }) => current.filter((item) => item.id !== itemId)),
    also: (update) => [update(theLists, withListCounts({ itemCount: -1, openCount: -1 }))],
    undo: {
      by: restore,
      vars: ({ listId, itemId }, before) => {
        const item = before?.items.find((candidate) => candidate.id === itemId);
        return item ? { listId, items: [item] } : null;
      },
    },
  }),

  clearChecked: defineChange("shopping", "clear-checked", {
    idempotent: true,
    ordered: true,
    send: ({ listId }: { listId: string }) => clearCheckedItems(listId),
    target: onList,
    describe: () => "Cleared ticked items",
    apply: onItems((current) => current.filter((item) => !item.checked)),
    also: (update) => [update(theLists, withListCounts())],
    undo: {
      by: restore,
      vars: ({ listId }, before) => {
        const checked = before?.items.filter((item) => item.checked) ?? [];
        return checked.length > 0 ? { listId, items: checked } : null;
      },
    },
  }),

  forgetHistory: defineChange("shopping", "forget-history", {
    idempotent: true,
    ordered: true,
    send: ({ names }: { names: string[] }) => forgetHistory(names),
    target: () => historyQuery().queryKey,
    describe: ({ names }) => `Hid ${names[0] ?? "an item"} from Buy again`,
    apply: (current, { names }) => {
      const forgotten = new Set(names.map(itemKey));
      return current.filter((item) => !forgotten.has(itemKey(item.name)));
    },
  }),

  restore,
};
