// Every change people make to the household's lists and their items (see lib/offline-changes.ts). Everything a change
// needs travels in its variables, which are saved with it on the device; their shape is part of
// what a phone may still have waiting, so change it only with care.
import { defineChange } from "@/lib/offline-changes.ts";

import {
  addItem,
  clearCheckedItems,
  createList,
  deleteItem,
  deleteList,
  renameList,
  updateItem,
  type ShoppingItem,
  type ShoppingList,
  type ShoppingListSummary,
} from "./shopping.api.ts";
import { listQuery, listsQuery } from "./shopping.queries.ts";

type Person = { id: string; name: string };

export type ToggleItem = { listId: string; itemId: string; checked: boolean; by: Person };
export type ItemChanges = { name?: string; quantity?: string | null };
export type EditItem = { listId: string; itemId: string; changes: ItemChanges };
export type NewItem = {
  listId: string;
  id: string;
  name: string;
  quantity: string | null;
  by: Person;
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
});

export const shoppingChanges = {
  // The id comes from the app, so the API ignores a second copy. Ordered, so the list is there
  // before the items added to it straight after.
  createList: defineChange("shopping", "create-list", {
    idempotent: true,
    ordered: true,
    send: ({ id, name }: NewList) => createList({ id, name }),
    target: theLists,
    apply: (current: ShoppingListSummary[], { id, name }) => [
      ...current,
      { id, name, itemCount: 0, openCount: 0 },
    ],
  }),

  // Renaming to the same name twice does the same as once
  renameList: defineChange("shopping", "rename-list", {
    idempotent: true,
    ordered: true,
    send: ({ listId, name }: RenameList) => renameList(listId, name),
    target: onList,
    apply: (current, { name }) => ({ ...current, name }),
  }),

  // A second delete does the same as the first, so this is kept across a restart. Ordered, so
  // changes made to the list before it went don't arrive after.
  deleteList: defineChange("shopping", "delete-list", {
    idempotent: true,
    ordered: true,
    send: ({ listId }: { listId: string }) => deleteList(listId),
    target: theLists,
    apply: (current, { listId }) => current.filter((list) => list.id !== listId),
  }),

  // Ordered, so a tick and its untick arrive as they were made, and never before the item's add
  toggle: defineChange("shopping", "toggle", {
    idempotent: true,
    ordered: true,
    send: ({ listId, itemId, checked }: ToggleItem) => updateItem(listId, itemId, { checked }),
    target: onList,
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
  }),

  // Sends only the fields that changed, so a housemate's edit to the other one stays. Ordered, so
  // it can't arrive after its item was removed.
  edit: defineChange("shopping", "edit", {
    idempotent: true,
    ordered: true,
    send: ({ listId, itemId, changes }: EditItem) => updateItem(listId, itemId, changes),
    target: onList,
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
  }),

  // A second delete fails, as the item is gone
  remove: defineChange("shopping", "remove", {
    idempotent: false,
    ordered: true,
    send: ({ listId, itemId }: ItemRef) => deleteItem(listId, itemId),
    target: onList,
    apply: onItems((current, { itemId }) => current.filter((item) => item.id !== itemId)),
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
    apply: onItems((current) => current.filter((item) => !item.checked)),
    undo: {
      by: restore,
      vars: ({ listId }, before) => {
        const checked = before?.items.filter((item) => item.checked) ?? [];
        return checked.length > 0 ? { listId, items: checked } : null;
      },
    },
  }),

  restore,
};
