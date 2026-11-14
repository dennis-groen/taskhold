// Every change people make to a list's items (see lib/offline-changes.ts). Everything a change
// needs travels in its variables, which are saved with it on the device; their shape is part of
// what a phone may still have waiting, so change it only with care.
import { defineChange } from "@/lib/offline-changes.ts";

import {
  addItem,
  clearCheckedItems,
  deleteItem,
  updateItem,
  type ShoppingItem,
  type ShoppingList,
} from "./shopping.api.ts";
import { listQuery } from "./shopping.queries.ts";

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
type RestoreItems = { listId: string; items: ShoppingItem[] };

/** Every change shows on the list it's on */
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
