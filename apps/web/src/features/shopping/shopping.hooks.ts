import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { offerUndo } from "@/lib/feedback.ts";

import { findWaiting, parseEntry, type Entry } from "./item-entry.ts";
import type { ShoppingItem } from "./shopping.api.ts";
import { shoppingMutations, type ItemChanges } from "./shopping.mutations.ts";
import { suggestBuyAgain } from "./buy-again.ts";
import { historyQuery, isListGone, listQuery } from "./shopping.queries.ts";

type Person = { id: string; name: string };

/**
 * A list plus the changes people make to it. Every change shows on screen straight away and is
 * rolled back if the API rejects it (see shopping.mutations.ts).
 */
export function useShoppingList(listId: string, viewer: Person) {
  const { data: list, error: refetchError } = useSuspenseQuery(listQuery(listId));
  const mutations = shoppingMutations(useQueryClient());
  const add = useAddItem(viewer);
  const addEntry = useAddEntry(viewer);
  const toggle = useMutation(mutations.toggle);

  const removals = removalScope(listId);
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
    /** Adds what was typed, unless it's already waiting on the list (see useAddEntry) */
    add: (name: string, quantity: string | null) => addEntry(listId, name, quantity),
    /** Adds an entry even though the list has it already. Returns the new item's id. */
    addAnyway: (entry: Entry) => add(listId, entry.name, entry.quantity),
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

/** What adding typed text did: added it, or found the same item already waiting on the list */
export type AddResult =
  | { kind: "added"; id: string; entry: Entry }
  | { kind: "already"; item: ShoppingItem; entry: Entry };

/**
 * Adds what someone typed to any list. A quantity written into the name moves to its own field
 * ("2 milk" is milk, 2), and an item that's already waiting on the list isn't added twice: that
 * item comes back instead, so the screen can offer to change its quantity or add it anyway.
 * Only checks a list that's loaded on the device; housemates' adds arrive through live updates.
 */
export function useAddEntry(viewer: Person) {
  const queryClient = useQueryClient();
  const add = useAddItem(viewer);
  return (listId: string, typedName: string, typedQuantity: string | null): AddResult => {
    const entry = parseEntry(typedName, typedQuantity);
    const list = queryClient.getQueryData(listQuery(listId).queryKey);
    const existing = list && findWaiting(list.items, entry.name);
    if (existing) return { kind: "already", item: existing, entry };
    return { kind: "added", id: add(listId, entry.name, entry.quantity), entry };
  };
}

/** Changes an item's name or quantity on any list; leave a field out to keep it */
export function useEditItem(listId: string | undefined) {
  const mutations = shoppingMutations(useQueryClient());
  const edit = useMutation({ ...mutations.edit, scope: removalScope(listId ?? "") });
  return (itemId: string, changes: ItemChanges) => {
    if (listId) edit.mutate({ listId, itemId, changes });
  };
}

/**
 * Edits, removals and the undos that put items back run one after another, so an undo can't
 * reach the API before the removal it undoes, and an edit can't arrive after its item went
 */
function removalScope(listId: string) {
  return { id: `shopping-removals-${listId}` };
}

/**
 * "Buy again" names for a list: the household's regulars, or past buys matching what's typed,
 * leaving out what's already waiting on that list. Nothing until the history has loaded.
 */
export function useBuyAgain(listId: string | undefined, typed: string): string[] {
  const { data: history = [] } = useQuery(historyQuery());
  const { data: list } = useQuery({ ...listQuery(listId ?? ""), enabled: listId !== undefined });
  // "Due" is judged once per screen, so chips don't reshuffle while someone is picking
  const [now] = useState(() => Temporal.Now.instant());
  const onList = list?.items.filter((item) => !item.checked).map((item) => item.name) ?? [];
  return suggestBuyAgain(history, { now, typed, onList });
}

/** Only what the list shows about a person, since a change is saved on the device with its variables */
function person({ id, name }: Person): Person {
  return { id, name };
}

function cleared(count: number): string {
  return count === 1 ? "1 item cleared" : `${count} items cleared`;
}
