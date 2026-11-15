// Every change to the household's chores: marking done, putting off and taking either back, and
// adding, editing, deleting and clearing them (see lib/offline-changes.ts).
// Everything a change needs travels in its variables, which are saved with it on the device; their
// shape is part of what a phone may still have waiting, so change it only with care.
//
// All of them are ordered, so an undo can't reach the API before what it undoes.
import { isDone, markDone, skip } from "@taskhold/api/chore-schedule";

import { defineChange } from "@/lib/offline-changes.ts";

import { scheduleOf } from "./chore-dates.ts";
import {
  clearDoneChores,
  completeChore,
  createChore,
  deleteChore,
  skipChore,
  undoCompletion,
  updateChore,
  type Chore,
  type ChoreDetail,
  type ChoreInput,
} from "./chores.api.ts";
import { choresQuery } from "./chores.queries.ts";

type Person = { id: string; name: string };

export type CompleteChore = { choreId: string; on: string; by: Person };
/** `by` is only for showing the skip before the API answers; changes saved before it lack it */
export type SkipChore = { choreId: string; today: string; by: Person };
export type MoveChore = { choreId: string; dueOn: string | null };

type Assignee = NonNullable<Chore["assignee"]>;

/** A new chore: the app picks the id; `assignee` is only for showing it before the API answers */
export type NewChore = ChoreInput & { id: string; assignee: Assignee | null };
/** `changes` holds only the fields the person changed; `assignee` is who `changes.assigneeId` is */
export type EditChore = {
  choreId: string;
  changes: Partial<ChoreInput>;
  assignee?: Assignee | null;
};

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

// Not shown before it's saved: only the API knows the due date to go back to (it's in the history
// entry the undo removes). A second undo would take back an earlier one too.
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

  // The API ignores a second skip on the same day
  skip: defineChange("chores", "skip", {
    idempotent: true,
    ordered: true,
    send: ({ choreId, today }: SkipChore) => skipChore(choreId, today),
    target: theChores,
    apply: (list, { choreId, today, by }) =>
      list.map((item) => (item.id === choreId ? skipped(item, by, today) : item)),
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

  // The id comes from the app, so the API ignores a second copy
  add: defineChange("chores", "add", {
    idempotent: true,
    ordered: true,
    send: ({ id, name, repeat, dueOn, assigneeId }: NewChore) =>
      createChore({ id, name, repeat, dueOn, assigneeId }),
    target: theChores,
    apply: (list, { id, name, repeat, dueOn, assignee }) => [
      ...list,
      { id, name, repeat, dueOn, assignee, lastCompletion: null, done: false },
    ],
  }),

  // Sends only the fields that changed, so a housemate's edit to another one stays. A form shows
  // its own error.
  edit: defineChange("chores", "edit", {
    idempotent: true,
    ordered: true,
    send: ({ choreId, changes }: EditChore) => updateChore(choreId, changes),
    target: theChores,
    apply: (list, edit) =>
      list.map((item) => (item.id === edit.choreId ? edited(item, edit) : item)),
    settle: withDetail,
    failure: false,
  }),

  // A second delete does the same as the first, so this is kept across a restart
  remove: defineChange("chores", "remove", {
    idempotent: true,
    ordered: true,
    send: (choreId: string) => deleteChore(choreId),
    target: theChores,
    apply: (list, choreId) => list.filter((item) => item.id !== choreId),
  }),

  clearDone: defineChange("chores", "clear-done", {
    idempotent: true,
    ordered: true,
    send: (_vars: null) => clearDoneChores(),
    target: theChores,
    apply: (list) => list.filter((item) => !item.done),
  }),
};

/** The chore after `person` marks it done on `on`, by the API's own rules */
export function markedDone(chore: Chore, person: Person, on: string): Chore {
  const done = markDone(scheduleOf(chore), Temporal.PlainDate.from(on));
  if (done.kind === "unchanged") return chore;
  return {
    ...chore,
    dueOn: done.dueOn?.toString() ?? null,
    done: chore.repeat === null,
    lastCompletion: shownEntry(person, on, false),
  };
}

/** The chore after `person` skips it on `on`, by the API's own rules */
function skipped(chore: Chore, person: Person, on: string): Chore {
  const moved = skip(scheduleOf(chore), Temporal.PlainDate.from(on));
  if (moved.kind !== "moved") return chore;
  return { ...chore, dueOn: moved.dueOn.toString(), lastCompletion: shownEntry(person, on, true) };
}

/** The chore after an edit, by the API's own rules: a chore that stops repeating starts over */
function edited(chore: Chore, { changes, assignee }: EditChore): Chore {
  const { assigneeId, ...fields } = changes;
  const next: Chore = {
    ...chore,
    ...fields,
    ...(assigneeId !== undefined && { assignee: assignee ?? null }),
  };
  // Its history goes when it stops repeating (the API clears it), so it's not done
  if (chore.repeat !== null && next.repeat === null) next.lastCompletion = null;
  return { ...next, done: isDone(scheduleOf(next)) };
}

/** A history entry to show until the API's own arrives */
function shownEntry(person: Person, on: string, wasSkipped: boolean): Chore["lastCompletion"] {
  return {
    id: crypto.randomUUID(),
    completedBy: person,
    completedOn: on,
    skipped: wasSkipped,
    createdAt: Temporal.Now.instant().toString(),
  };
}
