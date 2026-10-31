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

/**
 * A list plus the changes people make to it. Every change shows on screen straight away and is
 * rolled back if the API rejects it.
 */
export function useShoppingList(listId: string, viewer: Person) {
  const queryClient = useQueryClient();
  const { data: list, error: refetchError } = useSuspenseQuery(listQuery(listId));
  const [error, setError] = useState<string | null>(null);

  const options = {
    queryClient,
    listId,
    onStart: () => setError(null),
    onError: (err: unknown) =>
      setError(
        errorMessage(err, "Couldn't save that change. Check your connection and try again."),
      ),
  };

  const add = useListChange(options, {
    mutationFn: (item: { id: string; name: string; quantity: string | null }) =>
      addItem(listId, item),
    apply: (items, item) => [
      {
        ...item,
        checked: false,
        addedBy: viewer,
        checkedBy: null,
        checkedAt: null,
        createdAt: new Date().toISOString(),
      },
      ...items,
    ],
  });

  const toggle = useListChange(options, {
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      updateItem(listId, itemId, { checked }),
    apply: (items, { itemId, checked }) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              checked,
              checkedBy: checked ? viewer : null,
              checkedAt: checked ? new Date().toISOString() : null,
            }
          : item,
      ),
  });

  const remove = useListChange(options, {
    mutationFn: (itemId: string) => deleteItem(listId, itemId),
    apply: (items, itemId) => items.filter((item) => item.id !== itemId),
  });

  const clearChecked = useListChange(options, {
    mutationFn: () => clearCheckedItems(listId),
    apply: (items) => items.filter((item) => !item.checked),
  });

  return {
    list,
    /** Someone deleted the list while it was open */
    gone: isListGone(refetchError),
    /** The last change that failed, for people; cleared by the next change */
    error,
    add: (name: string, quantity: string | null) =>
      add.mutate({ id: crypto.randomUUID(), name, quantity }),
    toggle: (itemId: string, checked: boolean) => toggle.mutate({ itemId, checked }),
    remove: (itemId: string) => remove.mutate(itemId),
    clearChecked: () => clearChecked.mutate(),
  };
}

function useListChange<Vars>(
  {
    queryClient,
    listId,
    onStart,
    onError,
  }: {
    queryClient: QueryClient;
    listId: string;
    onStart: () => void;
    onError: (err: unknown) => void;
  },
  {
    mutationFn,
    apply,
  }: {
    mutationFn: (vars: Vars) => Promise<unknown>;
    apply: (items: ShoppingItem[], vars: Vars) => ShoppingItem[];
  },
) {
  // Typed key, so the cache reads and writes below know the data is a ShoppingList
  const { queryKey } = listQuery(listId);
  // Shared by every change to this list, so we know when the last one finishes
  const mutationKey = [...queryKey, "change"];

  return useMutation({
    mutationKey,
    mutationFn,
    onMutate: async (vars) => {
      onStart();
      // A poll that's already on its way would overwrite the optimistic change with older data
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(
        queryKey,
        (list) => list && { ...list, items: apply(list.items, vars) },
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      onError(err);
    },
    onSettled: () => {
      // Refetch after the last of several quick changes, so an early response can't undo a later one.
      // Everything under "shopping", so the counts on the dashboard follow too. Not awaited: the
      // change would count as running until the refetch ends, and the next one would skip its refetch.
      if (queryClient.isMutating({ mutationKey }) === 1) {
        void queryClient.invalidateQueries({ queryKey: shoppingKeys.all });
      }
    },
  });
}
