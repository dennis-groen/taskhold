import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { offerUndo } from "@/lib/feedback.ts";

import type { ShoppingItem } from "./shopping.api.ts";
import { shoppingMutations, type ItemChanges } from "./shopping.mutations.ts";
import { isListGone, listQuery } from "./shopping.queries.ts";

type Person = { id: string; name: string };

/**
 * A list plus the changes people make to it. Every change shows on screen straight away and is
 * rolled back if the API rejects it (see shopping.mutations.ts).
 */
export function useShoppingList(listId: string, viewer: Person) {
  const { data: list, error: refetchError } = useSuspenseQuery(listQuery(listId));
  const mutations = shoppingMutations(useQueryClient());
  const add = useAddItem(viewer);
  const toggle = useMutation(mutations.toggle);

  // Edits, removals and the undos that put items back run one after another, so an undo can't
  // reach the API before the removal it undoes, and an edit can't arrive after its item went
  const removals = { id: `shopping-removals-${listId}` };
  const edit = useMutation({ ...mutations.edit, scope: removals });
  const remove = useMutation({ ...mutations.remove, scope: removals });
  const clearChecked = useMutation({ ...mutations.clearChecked, scope: removals });
  const restore = useMutation({ ...mutations.restore, scope: removals });

  function offerRestore(removed: ShoppingItem[], message: string) {
    offerUndo(message, () => restore.mutate({ listId, items: removed }));
  }

  return {
    list,
    /** Someone deleted the list while it was open */
    gone: isListGone(refetchError),
    /** Returns the new item's id */
    add: (name: string, quantity: string | null) => add(listId, name, quantity),
    toggle: (itemId: string, checked: boolean) =>
      toggle.mutate({ listId, itemId, checked, by: person(viewer) }),
    /** Changes the name and quantity; leave a field out to keep it */
    edit: (itemId: string, changes: ItemChanges) => edit.mutate({ listId, itemId, changes }),
    remove: (itemId: string) => {
      const item = list.items.find((candidate) => candidate.id === itemId);
      if (!item) return;
      remove.mutate({ listId, itemId });
      offerRestore([item], `${item.name} removed`);
    },
    clearChecked: () => {
      const checked = list.items.filter((item) => item.checked);
      if (checked.length === 0) return;
      clearChecked.mutate({ listId });
      offerRestore(checked, cleared(checked.length));
    },
  };
}

/** Adds an item to any list, optimistically when that list is on screen or cached */
export function useAddItem(viewer: Person) {
  const add = useMutation(shoppingMutations(useQueryClient()).add);
  return (listId: string, name: string, quantity: string | null) => {
    const id = crypto.randomUUID();
    add.mutate({ listId, id, name, quantity, by: person(viewer) });
    return id;
  };
}

/** Only what the list shows about a person, since a change is saved on the device with its variables */
function person({ id, name }: Person): Person {
  return { id, name };
}

function cleared(count: number): string {
  return count === 1 ? "1 item cleared" : `${count} items cleared`;
}
