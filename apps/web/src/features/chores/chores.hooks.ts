import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { skip } from "@taskhold/api/chore-schedule";

import { dueGroup, dueLabel, today } from "@/lib/dates.ts";
import { useChange, type UndoOffer } from "@/lib/offline-changes.ts";
import type { PersonSummary } from "@/lib/shared-with.ts";

import type { Chore, ChoreInput } from "./chores.api.ts";
import { scheduleOf } from "./chore-dates.ts";
import { deleteAfterUndo, useWithoutHeld } from "./chore-delete-hold.ts";
import { choreChanges, markedDone } from "./chores.changes.ts";
import { choresQuery } from "./chores.queries.ts";

/**
 * The household's chores, plus marking them done and taking that back. Marking done shows on
 * screen straight away and is rolled back if the API rejects it (see chores.changes.ts).
 */
export function useChores(viewer: PersonSummary) {
  const { data: all } = useSuspenseQuery(choresQuery());
  const chores = useWithoutHeld(all);
  const complete = useChange(choreChanges.complete);
  const undo = useChange(choreChanges.undo);

  return {
    chores,
    /**
     * Marks the chore done today. Returns the chore as it is now. `undoOffer` words the Undo
     * notice from that; nothing is offered when the chore was done already.
     */
    complete: (chore: Chore, undoOffer?: (after: Chore) => UndoOffer) => {
      const on = today();
      // Only what the list shows about a person, since a change is saved on the device
      const by = { id: viewer.id, name: viewer.name };
      const after = markedDone(chore, by, on);
      complete.run({ choreId: chore.id, on, by }, undoOffer?.(after));
      return after;
    },
    undo: (choreId: string) => undo.run(choreId),
  };
}

/** The household's chores once they've loaded, for pages that don't wait for them (empty until then) */
export function useChoreList(): Chore[] {
  const { data: all = [] } = useQuery(choresQuery());
  return useWithoutHeld(all);
}

/** How many chores are late, for the badge on the Chores tab. Zero until they've loaded. */
export function useOverdueCount(): number {
  const chores = useChoreList();
  const on = today();
  return chores.filter((chore) => !chore.done && dueGroup(chore.dueOn, on) === "overdue").length;
}

/**
 * Putting a chore off: to tomorrow, which moves the date and nothing else, or skipping it this
 * time, which moves a repeating chore one interval on and says so in its history. Both offer Undo.
 */
export function usePutOff(viewer: PersonSummary) {
  const putOff = useChange(choreChanges.putOff);
  const skipChange = useChange(choreChanges.skip);

  return {
    /** `on` is today on this device */
    tomorrow: (chore: Chore, on: string) =>
      putOff.run(
        {
          choreId: chore.id,
          dueOn: Temporal.PlainDate.from(on).add({ days: 1 }).toString(),
        },
        { message: `${chore.name} moved to tomorrow` },
      ),
    skip: (chore: Chore, on: string) => {
      const moved = skip(scheduleOf(chore), Temporal.PlainDate.from(on));
      const detail = moved.kind === "moved" ? dueLabel(moved.dueOn.toString(), on) : undefined;
      skipChange.run(
        { choreId: chore.id, today: on, by: { id: viewer.id, name: viewer.name } },
        { message: `${chore.name} skipped`, detail },
      );
    },
  };
}

type Assignee = NonNullable<Chore["assignee"]>;

/** Who `assigneeId` is among the household's members, for showing it before the API answers */
const assigneeOf = (assigneeId: string | null, members: Assignee[]) =>
  members.find((member) => member.id === assigneeId) ?? null;

/**
 * Making, changing and removing chores. They show on screen straight away, wait for a connection,
 * and survive a restart (see chores.changes.ts). `members` is who a chore can be assigned to.
 */
export function useManageChores(members: Assignee[]) {
  const add = useChange(choreChanges.add);
  const edit = useChange(choreChanges.edit);
  const remove = useChange(choreChanges.remove);

  return {
    add: (input: ChoreInput) =>
      add.run({
        ...input,
        id: crypto.randomUUID(),
        assignee: assigneeOf(input.assigneeId, members),
      }),
    /**
     * Shows the edit straight away and sends it once there is a connection, so the sheet can close
     * at once. A failure rolls back with a notice.
     */
    save: (chore: Chore, input: ChoreInput) => {
      const changes = changedFields(chore, input);
      if (Object.keys(changes).length === 0) return;
      edit.run({
        choreId: chore.id,
        changes,
        assignee: assigneeOf(input.assigneeId, members),
      });
    },
    /** Takes the chore off the screen and offers Undo; it's deleted once that closes */
    remove: (chore: Chore) =>
      deleteAfterUndo([chore.id], `${chore.name} deleted`, () => remove.runAsync(chore.id)),
    /**
     * Deletes the done chores on screen, one by one rather than with the API's clear-done, so a
     * chore a housemate marks done during the Undo window isn't swept up without its own Undo
     */
    clearDone: (done: readonly Chore[]) => {
      const ids = done.map((chore) => chore.id);
      deleteAfterUndo(
        ids,
        done.length === 1 ? "1 chore cleared" : `${done.length} chores cleared`,
        () => Promise.all(ids.map((id) => remove.runAsync(id))),
      );
    },
  };
}

/** Only what's different from the chore, so an edit doesn't undo a housemate's change to the rest */
function changedFields(chore: Chore, input: ChoreInput): Partial<ChoreInput> {
  const changes: Partial<ChoreInput> = {};
  if (input.name !== chore.name) changes.name = input.name;
  if (input.dueOn !== chore.dueOn) changes.dueOn = input.dueOn;
  if (input.assigneeId !== (chore.assignee?.id ?? null)) changes.assigneeId = input.assigneeId;
  if (input.repeat?.every !== chore.repeat?.every || input.repeat?.unit !== chore.repeat?.unit) {
    changes.repeat = input.repeat;
  }
  return changes;
}
