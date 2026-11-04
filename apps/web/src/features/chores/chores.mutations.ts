import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { changeFailed } from "@/lib/feedback.ts";
import { resumable, type ChangeMeta } from "@/lib/offline-cache.ts";

import { addInterval } from "./chore-dates.ts";
import { completeChore, undoCompletion, type Chore } from "./chores.api.ts";
import { choreKeys, choresQuery } from "./chores.queries.ts";

type Person = { id: string; name: string };

// Every completion and undo starts with this key, so we know when the last one finishes
const changeKey = [...choreKeys.all, "change"] as const;

export type CompleteChore = { choreId: string; on: string; by: Person };

/**
 * Marking chores done and taking that back. These are also the query client's mutation defaults
 * (registerChoreMutations), so a completion that was waiting for a connection when the app closed
 * is sent once it opens again. Everything a change needs travels in its variables, which are
 * saved with it.
 */
export function choreMutations(queryClient: QueryClient) {
  return {
    // Shows on screen straight away and is rolled back if the API rejects it. The API ignores a
    // second completion on the same day.
    complete: mutationOptions({
      mutationKey: [...changeKey, "complete"],
      meta: { idempotent: true } satisfies ChangeMeta,
      mutationFn: ({ choreId, on }: CompleteChore) => completeChore(choreId, on),
      onMutate: async ({ choreId, on, by }) => {
        const { queryKey } = choresQuery();
        // A poll that's already on its way would overwrite the optimistic change with older data
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey);
        queryClient.setQueryData(queryKey, (list) =>
          list?.map((item) => (item.id === choreId ? markedDone(item, by, on) : item)),
        );
        return { previous };
      },
      onError: (err, _vars, context) => {
        if (context?.previous) queryClient.setQueryData(choresQuery().queryKey, context.previous);
        changeFailed(err, "Couldn't mark that done. Check your connection and try again.");
      },
      onSettled: () => refetchAfterLastChange(queryClient),
    }),

    // Not optimistic: only the API knows the due date to go back to. A second undo would take back
    // an earlier completion too.
    undo: mutationOptions({
      mutationKey: [...changeKey, "undo"],
      meta: { idempotent: false } satisfies ChangeMeta,
      mutationFn: (choreId: string) => undoCompletion(choreId),
      onSuccess: (detail) => {
        queryClient.setQueryData(choresQuery().queryKey, (list) =>
          list?.map((item) => (item.id === detail.id ? toListChore(detail) : item)),
        );
      },
      onError: (err) => changeFailed(err, "Couldn't undo that. Try again."),
      onSettled: () => refetchAfterLastChange(queryClient),
    }),
  };
}

/** Lets changes saved on the device run after a restart, when no page has set them up yet */
export function registerChoreMutations(queryClient: QueryClient): void {
  const changes = choreMutations(queryClient);
  resumable(queryClient, changes.complete);
  resumable(queryClient, changes.undo);
}

/** The chore after `person` does it on `on`, by the same rules as the API */
export function markedDone(chore: Chore, person: Person, on: string): Chore {
  if (chore.repeat ? chore.lastCompletion?.completedOn === on : chore.done) return chore;
  return {
    ...chore,
    dueOn: chore.repeat ? addInterval(on, chore.repeat) : chore.dueOn,
    done: chore.repeat === null,
    lastCompletion: {
      id: crypto.randomUUID(),
      completedBy: person,
      completedOn: on,
      createdAt: Temporal.Now.instant().toString(),
    },
  };
}

/** A chore's detail without its history, as the list holds it */
function toListChore({ history: _history, ...chore }: Chore & { history?: unknown }): Chore {
  return chore;
}

/**
 * Refetches after the last of several quick changes, so an early response can't undo a later one.
 * Not awaited: the change would count as running until the refetch ends.
 */
function refetchAfterLastChange(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: changeKey }) === 1) {
    void queryClient.invalidateQueries({ queryKey: choreKeys.all });
  }
}
