// Marking chores done, putting them off, and taking either back (see lib/offline-changes.ts).
// Everything a change needs travels in its variables, which are saved with it on the device; their
// shape is part of what a phone may still have waiting, so change it only with care.
//
// All of them are ordered, so an undo can't reach the API before what it undoes.
import { defineChange } from "@/lib/offline-changes.ts";

import { addInterval } from "./chore-dates.ts";
import {
  completeChore,
  skipChore,
  undoCompletion,
  updateChore,
  type Chore,
  type ChoreDetail,
} from "./chores.api.ts";
import { choresQuery } from "./chores.queries.ts";

type Person = { id: string; name: string };

export type CompleteChore = { choreId: string; on: string; by: Person };
export type SkipChore = { choreId: string; today: string };
export type MoveChore = { choreId: string; dueOn: string | null };

const theChores = () => choresQuery().queryKey;

const MOVE_FAILED = "Couldn't move that. Check your connection and try again.";
const UNDO_FAILED = "Couldn't undo that. Try again.";

/** Puts a chore as the API returned it in the list, without its history */
function withDetail(list: Chore[], detail: ChoreDetail): Chore[] {
  const { history: _history, ...chore } = detail;
  return list.map((item) => (item.id === chore.id ? chore : item));
}

function withDueOn(list: Chore[], { choreId, dueOn }: MoveChore): Chore[] {
  return list.map((item) => (item.id === choreId ? { ...item, dueOn } : item));
}

// Not shown before it's saved: only the API knows the due date to go back to. A second undo would
// take back an earlier completion too.
const undo = defineChange("chores", "undo", {
  idempotent: false,
  ordered: true,
  send: (choreId: string) => undoCompletion(choreId),
  target: theChores,
  settle: withDetail,
  failure: UNDO_FAILED,
});

// Puts back the due date a chore had before it was put off. Not kept in its history.
const moveDueDate = defineChange("chores", "due-date", {
  idempotent: true,
  ordered: true,
  send: ({ choreId, dueOn }: MoveChore) => updateChore(choreId, { dueOn }),
  target: theChores,
  apply: withDueOn,
  failure: UNDO_FAILED,
});

export const choreChanges = {
  // The API ignores a second completion on the same day
  complete: defineChange("chores", "complete", {
    idempotent: true,
    ordered: true,
    send: ({ choreId, on }: CompleteChore) => completeChore(choreId, on),
    target: theChores,
    apply: (list, { choreId, on, by }) =>
      list.map((item) => (item.id === choreId ? markedDone(item, by, on) : item)),
    failure: "Couldn't mark that done. Check your connection and try again.",
    undo: {
      by: undo,
      // Already done: the tap changed nothing, so Undo would take back the earlier time
      vars: ({ choreId, on, by }, before) => {
        const chore = before?.find((item) => item.id === choreId);
        return chore && markedDone(chore, by, on) !== chore ? choreId : null;
      },
    },
  }),

  undo,

  // Not shown before it's saved: the API works out the next due date. The API ignores a second
  // skip on the same day.
  skip: defineChange("chores", "skip", {
    idempotent: true,
    ordered: true,
    send: ({ choreId, today }: SkipChore) => skipChore(choreId, today),
    target: theChores,
    settle: withDetail,
    failure: MOVE_FAILED,
    undo: { by: undo, vars: ({ choreId }) => choreId },
  }),

  // Moves the date and nothing else
  putOff: defineChange("chores", "put-off", {
    idempotent: true,
    ordered: true,
    send: ({ choreId, dueOn }: MoveChore) => updateChore(choreId, { dueOn }),
    target: theChores,
    apply: withDueOn,
    failure: MOVE_FAILED,
    undo: {
      by: moveDueDate,
      vars: ({ choreId }, before) => {
        const chore = before?.find((item) => item.id === choreId);
        return chore ? { choreId, dueOn: chore.dueOn } : null;
      },
    },
  }),

  moveDueDate,
};

/** The chore after `person` does it on `on`, by the same rules as the API */
export function markedDone(chore: Chore, person: Person, on: string): Chore {
  // A skip earlier the same day doesn't count as done: someone may do it after all
  const doneToday = chore.lastCompletion?.completedOn === on && !chore.lastCompletion.skipped;
  if (chore.repeat ? doneToday : chore.done) return chore;
  return {
    ...chore,
    dueOn: chore.repeat ? addInterval(on, chore.repeat) : chore.dueOn,
    done: chore.repeat === null,
    lastCompletion: {
      id: crypto.randomUUID(),
      completedBy: person,
      completedOn: on,
      skipped: false,
      createdAt: Temporal.Now.instant().toString(),
    },
  };
}
