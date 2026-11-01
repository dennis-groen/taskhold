import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { errorMessage } from "@/lib/api-client.ts";

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
  const { error, callbacks } = useChangeError();

  const add = useAddItem(viewer, callbacks);

  const toggle = useListChange(callbacks, {
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

  const remove = useListChange(callbacks, {
    mutationFn: ({ itemId }: { listId: string; itemId: string }) => deleteItem(listId, itemId),
    apply: (items, { itemId }) => items.filter((item) => item.id !== itemId),
  });

  const clearChecked = useListChange(callbacks, {
    mutationFn: (_vars: { listId: string }) => clearCheckedItems(listId),
    apply: (items) => items.filter((item) => !item.checked),
  });

  return {
    list,
    /** Someone deleted the list while it was open */
    gone: isListGone(refetchError),
    /** The last change that failed, for people; cleared by the next change */
    error,
    add: (name: string, quantity: string | null) => add(listId, name, quantity),
    toggle: (itemId: string, checked: boolean) => toggle.mutate({ listId, itemId, checked }),
    remove: (itemId: string) => remove.mutate({ listId, itemId }),
    clearChecked: () => clearChecked.mutate({ listId }),
  };
}

/** Adds an item to any list, optimistically when that list is on screen or cached */
export function useAddItem(viewer: Person, callbacks: ChangeCallbacks) {
  const add = useListChange(callbacks, {
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

type ChangeCallbacks = { onStart: () => void; onError: (err: unknown) => void };

/** The message for the last change that failed, and the callbacks that keep it current */
export function useChangeError(): { error: string | null; callbacks: ChangeCallbacks } {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    callbacks: {
      onStart: () => setError(null),
      onError: (err) =>
        setError(
          errorMessage(err, "Couldn't save that change. Check your connection and try again."),
        ),
    },
  };
}

function useListChange<Vars extends { listId: string }>(
  { onStart, onError }: ChangeCallbacks,
  {
    mutationFn,
    apply,
  }: {
    mutationFn: (vars: Vars) => Promise<unknown>;
    apply: (items: ShoppingItem[], vars: Vars) => ShoppingItem[];
  },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: changeKey,
    mutationFn,
    onMutate: async (vars) => {
      onStart();
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
      onError(err);
    },
    onSettled: () => refetchAfterLastChange(queryClient),
  });
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
