// Business rules for chores. Every member of a household can see, change and do all of its chores;
// nobody else can, and a chore from another household looks the same as one that doesn't exist.
//
// A repeating chore's next due date counts from the day it was done, not from when it was due, so a
// household that falls behind doesn't come back to a pile of overdue chores.
import { transaction } from "../../db/client.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as householdsService from "../households/households.service.ts";
import { addInterval, couldBeToday } from "./chore-dates.ts";
import * as choresDal from "./chores.dal.ts";
import {
  assigneeNotMember,
  choreNotFound,
  dueDateRequired,
  implausibleToday,
  nothingToUndo,
} from "./chores.errors.ts";
import type { Chore, ChoreCompletion, ChoreDetail, Repeat } from "./chores.types.ts";

/** How many past completions a chore's detail shows */
const HISTORY_LENGTH = 10;

type ChoreInput = {
  name: string;
  repeat: Repeat | null;
  dueOn: string | null;
  assigneeId: string | null;
};

export async function getChores(userId: string): Promise<Chore[]> {
  const household = await householdsService.getMembershipOf(userId);
  const records = await choresDal.findChores(household.id);
  const latest = await choresDal.findLatestCompletions(records.map((record) => record.id));
  annotate("chores", { count: records.length });
  return records.map((record) => toChore(record, latest.get(record.id) ?? null));
}

export async function getChore(userId: string, choreId: string): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  return loadDetail(household.id, choreId);
}

export async function createChore(userId: string, input: ChoreInput): Promise<ChoreDetail> {
  const household = await householdsService.getMembershipOf(userId);
  await checkChore(household.id, input);
  const { id } = await choresDal.insertChore({
    householdId: household.id,
    ...toValues(input),
  });
  annotate("chores", { chore_id: id, repeats: input.repeat !== null });
  return loadDetail(household.id, id);
}

export async function updateChore(
  userId: string,
  choreId: string,
  changes: Partial<ChoreInput>,
): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  const ref = { householdId: household.id, choreId };

  await transaction(async (tx) => {
    // Locked, so the merged result is checked against what's actually there
    const current = await choresDal.lockChore(ref, tx);
    if (!current) throw choreNotFound();

    const merged = {
      repeat:
        changes.repeat !== undefined
          ? changes.repeat
          : current.repeatEvery && current.repeatUnit
            ? { every: current.repeatEvery, unit: current.repeatUnit }
            : null,
      dueOn: changes.dueOn !== undefined ? changes.dueOn : current.dueOn,
      assigneeId: changes.assigneeId ?? null,
    };
    await checkChore(household.id, merged);

    await choresDal.updateChore(
      ref,
      {
        name: changes.name,
        ...(changes.repeat !== undefined && {
          repeatEvery: changes.repeat?.every ?? null,
          repeatUnit: changes.repeat?.unit ?? null,
        }),
        dueOn: changes.dueOn,
        assigneeId: changes.assigneeId,
      },
      tx,
    );
  });
  return loadDetail(household.id, choreId);
}

export async function deleteChore(userId: string, choreId: string): Promise<void> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  const deleted = await choresDal.deleteChore({ householdId: household.id, choreId });
  if (!deleted) throw choreNotFound();
}

/**
 * Records that the user did the chore today, `today` being the date where they are. A repeating
 * chore is next due one interval after today. Doing it again the same day changes nothing, so a
 * double tap or two people at once count once.
 */
export async function completeChore(
  userId: string,
  choreId: string,
  today: string,
): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  if (!couldBeToday(today)) throw implausibleToday();
  const household = await householdsService.getMembershipOf(userId);
  const ref = { householdId: household.id, choreId };

  await transaction(async (tx) => {
    const current = await choresDal.lockChore(ref, tx);
    if (!current) throw choreNotFound();

    const [latest] = await choresDal.findCompletions(choreId, 1, tx);
    const { repeatEvery, repeatUnit } = current;
    const repeats = repeatEvery !== null && repeatUnit !== null;
    const alreadyDone = repeats ? latest?.completedOn === today : latest !== undefined;
    annotate("chores", { repeats, already_done: alreadyDone });
    if (alreadyDone) return;

    await choresDal.insertCompletion(
      { choreId, completedById: userId, completedOn: today, previousDueOn: current.dueOn },
      tx,
    );
    if (repeats) {
      await choresDal.updateChore(ref, { dueOn: addInterval(today, repeatEvery, repeatUnit) }, tx);
    }
  });
  return loadDetail(household.id, choreId);
}

/** Removes the chore's most recent completion and puts its due date back to what it was */
export async function undoLastCompletion(userId: string, choreId: string): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  const ref = { householdId: household.id, choreId };

  await transaction(async (tx) => {
    const current = await choresDal.lockChore(ref, tx);
    if (!current) throw choreNotFound();
    const [latest] = await choresDal.findCompletions(choreId, 1, tx);
    if (!latest) throw nothingToUndo();

    await choresDal.deleteCompletion(latest.id, tx);
    // A repeating chore must keep a due date. previousDueOn can be empty when the chore was a
    // one-off without a date at the time, and has been made to repeat since.
    const repeats = current.repeatEvery !== null;
    if (repeats && latest.previousDueOn !== null) {
      await choresDal.updateChore(ref, { dueOn: latest.previousDueOn }, tx);
    }
  });
  return loadDetail(household.id, choreId);
}

/** Removes one-off chores that are done. Returns how many went. */
export async function clearDoneChores(userId: string): Promise<number> {
  const household = await householdsService.getMembershipOf(userId);
  const removed = await choresDal.deleteDoneOneOffChores(household.id);
  annotate("chores", { removed_count: removed });
  return removed;
}

async function checkChore(
  householdId: string,
  chore: { repeat: Repeat | null; dueOn: string | null; assigneeId: string | null },
) {
  if (chore.repeat && !chore.dueOn) throw dueDateRequired();
  if (chore.assigneeId && !(await householdsService.isMemberOf(householdId, chore.assigneeId))) {
    throw assigneeNotMember();
  }
}

async function loadDetail(householdId: string, choreId: string): Promise<ChoreDetail> {
  const record = await choresDal.findChore({ householdId, choreId });
  if (!record) throw choreNotFound();
  const history = await choresDal.findCompletions(choreId, HISTORY_LENGTH);
  return {
    ...toChore(record, history[0] ?? null),
    history: history.map(toCompletion),
  };
}

function toValues(input: ChoreInput) {
  return {
    name: input.name,
    repeatEvery: input.repeat?.every ?? null,
    repeatUnit: input.repeat?.unit ?? null,
    dueOn: input.dueOn,
    assigneeId: input.assigneeId,
  };
}

function toChore(record: choresDal.ChoreRecord, latest: choresDal.CompletionRecord | null): Chore {
  const repeat =
    record.repeatEvery !== null && record.repeatUnit !== null
      ? { every: record.repeatEvery, unit: record.repeatUnit }
      : null;
  return {
    id: record.id,
    name: record.name,
    repeat,
    dueOn: record.dueOn,
    assignee: record.assignee,
    lastCompletion: latest && toCompletion(latest),
    done: repeat === null && latest !== null,
  };
}

function toCompletion(record: choresDal.CompletionRecord): ChoreCompletion {
  return {
    id: record.id,
    completedBy: record.completedBy,
    completedOn: record.completedOn,
    createdAt: record.createdAt,
  };
}
