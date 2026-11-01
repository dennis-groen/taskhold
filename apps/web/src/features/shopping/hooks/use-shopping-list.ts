import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { changeFailed, offerUndo } from "@/lib/feedback.ts";

import {
  addItem,
  clearCheckedItems,
  deleteItem,
  updateItem,
  type ShoppingItem,
} from "../shopping.api.ts";
import { isListGone, listQuery, shoppingKeys } from "../shopping.queries.ts";

type Person = { id: string; name: string };

// Shared by every change to every list, so we know when the last one finishes
const changeKey = [...shoppingKeys.all, "change"];

/**
 * A list plus the changes people make to it. Every change shows on screen straight away and is
 * rolled back if the API rejects it.
 */
export function useShoppingList(listId: string, viewer: Person) {
  const { data: list, error: refetchError } = useSuspenseQuery(listQuery(listId));
  const add = useAddItem(viewer);

  const toggle = useListChange({
    mutationFn: ({ itemId, checked }: { listId: string; itemId: string; checked: boolean }) =>
      updateItem(listId, itemId, { checked }),
    apply: (items, { itemId, checked }) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              checked,
              checkedBy: checked ? viewer : null,
              checkedAt: checked ? Temporal.Now.instant().toString() : null,
            }
          : item,
      ),
  });

  // Removals and the undos that put items back run one after another, so an undo can't reach the
  // API before the removal it undoes
  const removals = { id: `shopping-removals-${listId}` };

  const remove = useListChange({
    scope: removals,
    mutationFn: ({ itemId }: { listId: string; itemId: string }) => deleteItem(listId, itemId),
    apply: (items, { itemId }) => items.filter((item) => item.id !== itemId),
  });

  const clearChecked = useListChange({
    scope: removals,
    mutationFn: (_vars: { listId: string }) => clearCheckedItems(listId),
    apply: (items) => items.filter((item) => !item.checked),
  });

  // Puts removed items back as they were, keeping their ids so open screens still match
  const restore = useListChange({
    scope: removals,
    mutationFn: async ({ items }: { listId: string; items: ShoppingItem[] }) => {
      for (const { id, name, quantity, checked } of items) {
        await addItem(listId, { id, name, quantity });
        if (checked) await updateItem(listId, id, { checked });
      }
    },
    apply: (items, vars) => [...vars.items, ...items],
  });

  function offerRestore(removed: ShoppingItem[], message: string) {
    offerUndo(message, () => restore.mutate({ listId, items: removed }));
  }

  return {
    list,
    /** Someone deleted the list while it was open */
    gone: isListGone(refetchError),
    add: (name: string, quantity: string | null) => add(listId, name, quantity),
    toggle: (itemId: string, checked: boolean) => toggle.mutate({ listId, itemId, checked }),
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
  const add = useListChange({
    mutationFn: ({
      listId,
      ...item
    }: {
      listId: string;
      id: string;
      name: string;
      quantity: string | null;
    }) => addItem(listId, item),
    apply: (items, { listId: _listId, ...item }) => [
      {
        ...item,
        checked: false,
        addedBy: viewer,
        checkedBy: null,
        checkedAt: null,
        createdAt: Temporal.Now.instant().toString(),
      },
      ...items,
    ],
  });
  return (listId: string, name: string, quantity: string | null) =>
    add.mutate({ listId, id: crypto.randomUUID(), name, quantity });
}

function useListChange<Vars extends { listId: string }>({
  scope,
  mutationFn,
  apply,
}: {
  scope?: { id: string };
  mutationFn: (vars: Vars) => Promise<unknown>;
  apply: (items: ShoppingItem[], vars: Vars) => ShoppingItem[];
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: changeKey,
    scope,
    mutationFn,
    onMutate: async (vars) => {
      // Typed key, so the cache reads and writes below know the data is a ShoppingList
      const { queryKey } = listQuery(vars.listId);
      // A poll that's already on its way would overwrite the optimistic change with older data
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(
        queryKey,
        (list) => list && { ...list, items: apply(list.items, vars) },
      );
      return { previous };
    },
    onError: (err, vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(listQuery(vars.listId).queryKey, context.previous);
      changeFailed(err, "Couldn't save that change. Check your connection and try again.");
    },
    onSettled: () => refetchAfterLastChange(queryClient),
  });
}

function cleared(count: number): string {
  return count === 1 ? "1 item cleared" : `${count} items cleared`;
}

/**
 * Refetches after the last of several quick changes, so an early response can't undo a later one.
 * Everything under "shopping", so list counts follow too. Not awaited: the change would count as
 * running until the refetch ends, and the next one would skip its refetch.
 */
function refetchAfterLastChange(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: changeKey }) === 1) {
    void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
  }
}
