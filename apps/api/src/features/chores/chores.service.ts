// Business rules for chores. Every member of a household can see, change and do all of its chores;
// nobody else can, and a chore from another household looks the same as one that doesn't exist.
//
// A repeating chore's next due date counts from the day it was done, not from when it was due, so a
// household that falls behind doesn't come back to a pile of overdue chores.
import { transaction } from "../../db/db.ts";
import { announce } from "../../lib/live-changes.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as householdsService from "../households/households.service.ts";
import { addInterval, couldBeToday } from "./chore-dates.ts";
import * as choresRepo from "./chores.repo.ts";
import {
  assigneeNotMember,
  choreNotFound,
  dueDateRequired,
  implausibleToday,
  nothingToUndo,
} from "./chores.errors.ts";
import type {
  Chore,
  ChoreCompletion,
  ChoreDetail,
  CreateChoreInput,
  Repeat,
  UpdateChoreInput,
} from "./chores.schema.ts";

/** How many past completions a chore's detail shows */
const HISTORY_LENGTH = 10;

export async function getChores(userId: string): Promise<Chore[]> {
  const household = await householdsService.getMembershipOf(userId);
  const records = await choresRepo.findChores(household.id);
  const latest = await choresRepo.findLatestCompletions(records.map((record) => record.id));
  annotate("chores", { count: records.length });
  return records.map((record) => toChore(record, latest.get(record.id) ?? null));
}

export async function getChore(userId: string, choreId: string): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  return loadDetail(household.id, choreId);
}

export async function createChore(userId: string, input: CreateChoreInput): Promise<ChoreDetail> {
  const household = await householdsService.getMembershipOf(userId);
  await checkChore(household.id, input);
  const { id } = await choresRepo.insertChore({
    householdId: household.id,
    ...toValues(input),
  });
  annotate("chores", { chore_id: id, repeats: input.repeat !== null });
  await changed(household.id);
  return loadDetail(household.id, id);
}

export async function updateChore(
  userId: string,
  choreId: string,
  changes: UpdateChoreInput,
): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  const ref = { householdId: household.id, choreId };

  await transaction(async (tx) => {
    // Locked, so the merged result is checked against what's actually there
    const current = await choresRepo.lockChore(ref, tx);
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

    await choresRepo.updateChore(
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
  await changed(household.id);
  return loadDetail(household.id, choreId);
}

export async function deleteChore(userId: string, choreId: string): Promise<void> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  const deleted = await choresRepo.deleteChore({ householdId: household.id, choreId });
  if (!deleted) throw choreNotFound();
  await changed(household.id);
}

/**
 * Records that the user did the chore today, `today` being the date where they are. A repeating
 * chore is next due one interval after today. Doing it again the same day changes nothing, so a
 * double tap or two people at once count once.
 */
export async function completeChore(
  userId: string,
  choreId: string,
  today: Temporal.PlainDate,
): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  if (!couldBeToday(today)) throw implausibleToday();
  const household = await householdsService.getMembershipOf(userId);
  const ref = { householdId: household.id, choreId };

  await transaction(async (tx) => {
    const current = await choresRepo.lockChore(ref, tx);
    if (!current) throw choreNotFound();

    const [latest] = await choresRepo.findCompletions(choreId, 1, tx);
    const { repeatEvery, repeatUnit } = current;
    const repeats = repeatEvery !== null && repeatUnit !== null;
    const alreadyDone = repeats
      ? latest !== undefined && latest.completedOn.equals(today)
      : latest !== undefined;
    annotate("chores", { repeats, already_done: alreadyDone });
    if (alreadyDone) return;

    await choresRepo.insertCompletion(
      { choreId, completedById: userId, completedOn: today, previousDueOn: current.dueOn },
      tx,
    );
    if (repeats) {
      await choresRepo.updateChore(ref, { dueOn: addInterval(today, repeatEvery, repeatUnit) }, tx);
    }
  });
  await changed(household.id);
  return loadDetail(household.id, choreId);
}

/** Removes the chore's most recent completion and puts its due date back to what it was */
export async function undoLastCompletion(userId: string, choreId: string): Promise<ChoreDetail> {
  annotate("chores", { chore_id: choreId });
  const household = await householdsService.getMembershipOf(userId);
  const ref = { householdId: household.id, choreId };

  await transaction(async (tx) => {
    const current = await choresRepo.lockChore(ref, tx);
    if (!current) throw choreNotFound();
    const [latest] = await choresRepo.findCompletions(choreId, 1, tx);
    if (!latest) throw nothingToUndo();

    await choresRepo.deleteCompletion(latest.id, tx);
    // A repeating chore must keep a due date. previousDueOn can be empty when the chore was a
    // one-off without a date at the time, and has been made to repeat since.
    const repeats = current.repeatEvery !== null;
    if (repeats && latest.previousDueOn !== null) {
      await choresRepo.updateChore(ref, { dueOn: latest.previousDueOn }, tx);
    }
  });
  await changed(household.id);
  return loadDetail(household.id, choreId);
}

/** Removes one-off chores that are done. Returns how many went. */
export async function clearDoneChores(userId: string): Promise<number> {
  const household = await householdsService.getMembershipOf(userId);
  const removed = await choresRepo.deleteDoneOneOffChores(household.id);
  annotate("chores", { removed_count: removed });
  if (removed > 0) await changed(household.id);
  return removed;
}

/**
 * For reminders: names of the person's chores that aren't done and are due on or before `today`,
 * split into due today and overdue. Their chores are the ones assigned to them or to nobody.
 */
export async function findDueChores(
  userId: string,
  today: Temporal.PlainDate,
): Promise<{ today: string[]; overdue: string[] }> {
  const due = { today: [] as string[], overdue: [] as string[] };
  const household = await householdsService.findMembership(userId);
  if (!household) return due;

  const records = await choresRepo.findChores(household.id);
  const latest = await choresRepo.findLatestCompletions(records.map((record) => record.id));
  for (const record of records) {
    const chore = toChore(record, latest.get(record.id) ?? null);
    if (chore.done || !chore.dueOn) continue;
    if (chore.assignee && chore.assignee.id !== userId) continue;
    const order = Temporal.PlainDate.compare(chore.dueOn, today);
    if (order === 0) due.today.push(chore.name);
    else if (order < 0) due.overdue.push(chore.name);
  }
  return due;
}

async function checkChore(
  householdId: string,
  chore: { repeat: Repeat | null; dueOn: Temporal.PlainDate | null; assigneeId: string | null },
) {
  if (chore.repeat && !chore.dueOn) throw dueDateRequired();
  if (chore.assigneeId && !(await householdsService.isMemberOf(householdId, chore.assigneeId))) {
    throw assigneeNotMember();
  }
}

async function loadDetail(householdId: string, choreId: string): Promise<ChoreDetail> {
  const record = await choresRepo.findChore({ householdId, choreId });
  if (!record) throw choreNotFound();
  const history = await choresRepo.findCompletions(choreId, HISTORY_LENGTH);
  return {
    ...toChore(record, history[0] ?? null),
    history: history.map(toCompletion),
  };
}

function toValues(input: CreateChoreInput) {
  return {
    name: input.name,
    repeatEvery: input.repeat?.every ?? null,
    repeatUnit: input.repeat?.unit ?? null,
    dueOn: input.dueOn,
    assigneeId: input.assigneeId,
  };
}

function toChore(
  record: choresRepo.ChoreRecord,
  latest: choresRepo.CompletionRecord | null,
): Chore {
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

function toCompletion(record: choresRepo.CompletionRecord): ChoreCompletion {
  return {
    id: record.id,
    completedBy: record.completedBy,
    completedOn: record.completedOn,
    createdAt: record.createdAt,
  };
}

/** Tells everyone in the household that its chores changed */
function changed(householdId: string) {
  return announce({ householdId, topic: "chores" });
}
