import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { errorMessage } from "@/lib/api-client.ts";

import { addInterval, today } from "../chore-dates.ts";
import { completeChore, undoCompletion, type Chore } from "../chores.api.ts";
import { choreKeys, choresQuery } from "../chores.queries.ts";

type Person = { id: string; name: string };

// Shared by every completion and undo, so we know when the last one finishes
const changeKey = [...choreKeys.all, "change"];

/**
 * The household's chores, plus marking them done and taking that back. Marking done shows on
 * screen straight away and is rolled back if the API rejects it.
 */
export function useChores(viewer: Person) {
  const { data: chores } = useSuspenseQuery(choresQuery());
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const complete = useMutation({
    mutationKey: changeKey,
    mutationFn: ({ chore, on }: { chore: Chore; on: string }) => completeChore(chore.id, on),
    onMutate: async ({ chore, on }) => {
      setError(null);
      const { queryKey } = choresQuery();
      // A poll that's already on its way would overwrite the optimistic change with older data
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (list) =>
        list?.map((item) => (item.id === chore.id ? markedDone(item, viewer, on) : item)),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(choresQuery().queryKey, context.previous);
      setError(errorMessage(err, "Couldn't mark that done. Check your connection and try again."));
    },
    onSettled: () => refetchAfterLastChange(queryClient),
  });

  const undo = useMutation({
    mutationKey: changeKey,
    mutationFn: (choreId: string) => undoCompletion(choreId),
    onMutate: () => setError(null),
    // Not optimistic: only the API knows the due date to go back to
    onSuccess: (detail) => {
      queryClient.setQueryData(choresQuery().queryKey, (list) =>
        list?.map((item) => (item.id === detail.id ? toListChore(detail) : item)),
      );
    },
    onError: (err) => setError(errorMessage(err, "Couldn't undo that. Try again.")),
    onSettled: () => refetchAfterLastChange(queryClient),
  });

  return {
    chores,
    /** The last change that failed, for people; cleared by the next change */
    error,
    /** Marks the chore done today. Returns the chore as it is now, for an undo message. */
    complete: (chore: Chore) => {
      const on = today();
      complete.mutate({ chore, on });
      return markedDone(chore, viewer, on);
    },
    undo: (choreId: string) => undo.mutate(choreId),
  };
}

/** The chore after `person` does it on `on`, by the same rules as the API */
function markedDone(chore: Chore, person: Person, on: string): Chore {
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
export function toListChore({ history: _history, ...chore }: Chore & { history?: unknown }): Chore {
  return chore;
}

/**
 * Refetches after the last of several quick changes, so an early response can't undo a later one.
 * Not awaited: the change would count as running until the refetch ends.
 */
export function refetchAfterLastChange(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: changeKey }) === 1) {
    void queryClient.invalidateQueries({ queryKey: choreKeys.all });
  }
}
