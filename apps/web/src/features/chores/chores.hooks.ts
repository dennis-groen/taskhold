import { useSuspenseQuery } from "@tanstack/react-query";

import { today } from "@/lib/dates.ts";
import { useChange, type UndoOffer } from "@/lib/offline-changes.ts";

import type { Chore } from "./chores.api.ts";
import { choreChanges, markedDone } from "./chores.changes.ts";
import { choresQuery } from "./chores.queries.ts";

type Person = { id: string; name: string };

/**
 * The household's chores, plus marking them done and taking that back. Marking done shows on
 * screen straight away and is rolled back if the API rejects it (see chores.changes.ts).
 */
export function useChores(viewer: Person) {
  const { data: chores } = useSuspenseQuery(choresQuery());
  const complete = useChange(choreChanges.complete);
  const undo = useChange(choreChanges.undo);

  return {
    chores,
    /**
     * Marks the chore done today. Returns the chore as it is now. `offerUndo` words the Undo
     * notice from that; nothing is offered when the chore was done already.
     */
    complete: (chore: Chore, offerUndo?: (after: Chore) => UndoOffer) => {
      const on = today();
      // Only what the list shows about a person, since a change is saved on the device
      const by = { id: viewer.id, name: viewer.name };
      const after = markedDone(chore, by, on);
      complete.run({ choreId: chore.id, on, by }, offerUndo?.(after));
      return after;
    },
    undo: (choreId: string) => undo.run(choreId),
  };
}

/**
 * Putting a chore off: to tomorrow, which moves the date and nothing else, or skipping it this
 * time, which moves a repeating chore one interval on and says so in its history. Both offer Undo.
 */
export function usePutOff() {
  const putOff = useChange(choreChanges.putOff);
  const skip = useChange(choreChanges.skip);

  return {
    /** `on` is today on this device */
    tomorrow: (chore: Chore, on: string) =>
      putOff.run(
        {
          choreId: chore.id,
          dueOn: Temporal.PlainDate.from(on).add({ days: 1 }).toString(),
        },
        { message: `${chore.name} moved to tomorrow.` },
      ),
    skip: (chore: Chore, on: string) =>
      skip.run({ choreId: chore.id, today: on }, { message: `${chore.name} skipped.` }),
  };
}
