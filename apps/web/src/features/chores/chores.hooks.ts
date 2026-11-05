import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { today } from "@/lib/dates.ts";

import type { Chore } from "./chores.api.ts";
import { choreMutations, markedDone } from "./chores.mutations.ts";
import { choresQuery } from "./chores.queries.ts";

type Person = { id: string; name: string };

/**
 * The household's chores, plus marking them done and taking that back. Marking done shows on
 * screen straight away and is rolled back if the API rejects it (see chores.mutations.ts).
 */
export function useChores(viewer: Person) {
  const { data: chores } = useSuspenseQuery(choresQuery());
  const mutations = choreMutations(useQueryClient());
  const complete = useMutation(mutations.complete);
  const undo = useMutation(mutations.undo);

  return {
    chores,
    /** Marks the chore done today. Returns the chore as it is now, for an undo message. */
    complete: (chore: Chore) => {
      const on = today();
      // Only what the list shows about a person, since a change is saved on the device
      const by = { id: viewer.id, name: viewer.name };
      complete.mutate({ choreId: chore.id, on, by });
      return markedDone(chore, by, on);
    },
    undo: (choreId: string) => undo.mutate(choreId),
  };
}
