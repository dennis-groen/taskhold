import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useChange } from "@/lib/offline-changes.ts";

import type { ShoppingListSummary } from "./shopping.api.ts";
import { shoppingChanges, type ItemChanges } from "./shopping.changes.ts";
import { suggestBuyAgain } from "./buy-again.ts";
import { historyQuery, isListGone, listQuery, listsQuery } from "./shopping.queries.ts";

type Person = { id: string; name: string };

/**
 * A list plus the changes people make to it. Every change shows on screen straight away and is
 * rolled back if the API rejects it (see shopping.changes.ts).
 */
export function useShoppingList(listId: string, viewer: Person) {
  const { data: list, error: refetchError } = useSuspenseQuery(listQuery(listId));
  const toggle = useChange(shoppingChanges.toggle);
  const edit = useChange(shoppingChanges.edit);
  const remove = useChange(shoppingChanges.remove);
  const clearChecked = useChange(shoppingChanges.clearChecked);

  return {
    list,
    /** Someone deleted the list while it was open */
    gone: isListGone(refetchError),
    toggle: (itemId: string, checked: boolean) =>
      toggle.run({ listId, itemId, checked, by: person(viewer) }),
    /** Changes the name and quantity; leave a field out to keep it */
    edit: (itemId: string, changes: ItemChanges) => edit.run({ listId, itemId, changes }),
    remove: (itemId: string) => {
      const item = list.items.find((candidate) => candidate.id === itemId);
      if (!item) return;
      remove.run({ listId, itemId }, { message: `${item.name} removed` });
    },
    clearChecked: () => {
      const ticked = list.items.filter((item) => item.checked);
      if (ticked.length === 0) return;
      clearChecked.run(
        { listId },
        { message: cleared(ticked.length), detail: namesOf(ticked.map((item) => item.name)) },
      );
    },
  };
}

/**
 * Making, renaming and deleting lists. They show straight away, wait for a connection and survive
 * a restart (see shopping.changes.ts); a failure rolls back with a notice.
 */
export function useManageLists() {
  const queryClient = useQueryClient();
  const createList = useChange(shoppingChanges.createList);
  const renameList = useChange(shoppingChanges.renameList);
  const deleteList = useChange(shoppingChanges.deleteList);

  return {
    /** Returns the new list's id, so it can be opened straight away */
    create: (name: string) => {
      const id = crypto.randomUUID();
      // The new list opens before the API has it, offline too
      queryClient.setQueryData(listQuery(id).queryKey, { id, name, items: [] });
      createList.run({ id, name });
      return id;
    },
    rename: (listId: string, name: string) => {
      renameList.run({ listId, name });
      // The overview shows the name too; the refetch after the change puts it right if it fails
      queryClient.setQueryData(listsQuery().queryKey, (lists: ShoppingListSummary[] | undefined) =>
        lists?.map((list) => (list.id === listId ? { ...list, name } : list)),
      );
    },
    /** Call once the list's page has been left, so it doesn't look for a list that's gone */
    remove: (listId: string) => {
      deleteList.run({ listId });
      queryClient.removeQueries({ queryKey: listQuery(listId).queryKey });
    },
  };
}

/** Adds an item to any list, optimistically when that list is on screen or cached */
export function useAddItem(viewer: Person) {
  const add = useChange(shoppingChanges.add);
  return (listId: string, name: string, quantity: string | null) => {
    const id = crypto.randomUUID();
    add.run({ listId, id, name, quantity, by: person(viewer) });
    return id;
  };
}

/** Changes an item's name or quantity on any list; leave a field out to keep it */
export function useEditItem(listId: string | undefined) {
  const edit = useChange(shoppingChanges.edit);
  return (itemId: string, changes: ItemChanges) => {
    if (listId) edit.run({ listId, itemId, changes });
  };
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
  return count === 1 ? "Cleared 1 ticked item" : `Cleared ${count} ticked items`;
}

/** "Bananas, Lemons, Oat milk and 2 more" */
export function namesOf(names: string[], shown = 3): string {
  if (names.length <= shown) return names.join(", ");
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}
