import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { changeFailed } from "@/lib/feedback.ts";
import { resumable, type ChangeMeta } from "@/lib/offline-cache.ts";

import {
  addItem,
  clearCheckedItems,
  deleteItem,
  updateItem,
  type ShoppingItem,
} from "./shopping.api.ts";
import { listQuery, shoppingKeys } from "./shopping.queries.ts";

type Person = { id: string; name: string };

// Every change to every list starts with this key, so we know when the last one finishes
const changeKey = [...shoppingKeys.all, "change"] as const;

/**
 * Every change people make to a list. Each shows on screen straight away and is rolled back if the
 * API rejects it.
 *
 * These are also the query client's mutation defaults (registerShoppingMutations), so a change
 * that was waiting for a connection when the app closed is sent once it opens again. That's why
 * everything a change needs travels in its variables, which are saved with it.
 */
export function shoppingMutations(queryClient: QueryClient) {
  function listChange<Vars extends { listId: string }>(
    name: string,
    {
      idempotent,
      mutationFn,
      apply,
    }: {
      /** Sending it twice does the same as once (see ChangeMeta) */
      idempotent: boolean;
      mutationFn: (vars: Vars) => Promise<unknown>;
      apply: (items: ShoppingItem[], vars: Vars) => ShoppingItem[];
    },
  ) {
    return mutationOptions({
      mutationKey: [...changeKey, name],
      meta: { idempotent } satisfies ChangeMeta,
      mutationFn,
      onMutate: async (vars: Vars) => {
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

  return {
    toggle: listChange("toggle", {
      idempotent: true,
      mutationFn: ({ listId, itemId, checked }: ToggleItem) =>
        updateItem(listId, itemId, { checked }),
      apply: (items, { itemId, checked, by }) =>
        items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                checked,
                checkedBy: checked ? by : null,
                checkedAt: checked ? Temporal.Now.instant().toString() : null,
              }
            : item,
        ),
    }),

    // The id comes from the app, so the API ignores a second copy
    add: listChange("add", {
      idempotent: true,
      mutationFn: ({ listId, id, name, quantity }: NewItem) =>
        addItem(listId, { id, name, quantity }),
      apply: (items, { id, name, quantity, by }) => [
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
        ...items,
      ],
    }),

    // A second delete fails, as the item is gone
    remove: listChange("remove", {
      idempotent: false,
      mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
        deleteItem(listId, itemId),
      apply: (items, { itemId }) => items.filter((item) => item.id !== itemId),
    }),

    clearChecked: listChange("clear-checked", {
      idempotent: true,
      mutationFn: ({ listId }: { listId: string }) => clearCheckedItems(listId),
      apply: (items) => items.filter((item) => !item.checked),
    }),

    // Puts removed items back as they were, keeping their ids so open screens still match
    restore: listChange("restore", {
      idempotent: true,
      mutationFn: async ({ listId, items }: { listId: string; items: ShoppingItem[] }) => {
        for (const { id, name, quantity, checked } of items) {
          await addItem(listId, { id, name, quantity });
          if (checked) await updateItem(listId, id, { checked });
        }
      },
      apply: (items, vars) => [...vars.items, ...items],
    }),
  };
}

export type ToggleItem = { listId: string; itemId: string; checked: boolean; by: Person };
export type NewItem = {
  listId: string;
  id: string;
  name: string;
  quantity: string | null;
  by: Person;
};

/** Lets changes saved on the device run after a restart, when no page has set them up yet */
export function registerShoppingMutations(queryClient: QueryClient): void {
  const changes = shoppingMutations(queryClient);
  resumable(queryClient, changes.toggle);
  resumable(queryClient, changes.add);
  resumable(queryClient, changes.remove);
  resumable(queryClient, changes.clearChecked);
  resumable(queryClient, changes.restore);
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
