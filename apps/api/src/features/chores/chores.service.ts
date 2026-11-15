// Business rules for chores. Every member of a household can see, change and do all of its chores;
// nobody else can, and a chore from another household looks the same as one that doesn't exist.
//
// What marking done, skipping and putting off do to a due date is chore-schedule.ts's, shared with
// the web app. This file decides who may do it, locks, and writes.
import { transaction, type Executor } from "../../db/db.ts";
import { announce } from "../live/live-changes.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as householdsService from "../households/households.service.ts";
import { couldBeToday } from "./client-today.ts";
import { isDone, markDone, skip, type ChoreSchedule } from "./chore-schedule.ts";
import * as choresRepo from "./chores.repo.ts";
import {
  assigneeNotMember,
  choreLimitReached,
  choreNotFound,
  dueDateRequired,
  implausibleToday,
  notRepeating,
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

// Far above what a household uses; it keeps one account from filling the shared database
const MAX_CHORES = 200;

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

/**
 * Pass `executor` when creating the chore as part of another feature's transaction (e.g. moving a
 * to-do): every query then runs on it, instead of waiting on the pool for a second connection
 * while the transaction holds one.
 */
export async function createChore(
  userId: string,
  input: CreateChoreInput,
  executor?: Executor,
): Promise<ChoreDetail> {
  const household = await householdsService.getMembershipOf(userId, executor);
  await checkChore(household.id, input, executor);
  if ((await choresRepo.countChores(household.id, executor)) >= MAX_CHORES) {
    throw choreLimitReached();
  }
  const { id } = await choresRepo.insertChore(
    { householdId: household.id, ...toValues(input) },
    executor,
  );
  annotate("chores", { chore_id: id, repeats: input.repeat !== null });
  await changed(household.id, executor);
  return loadDetail(household.id, id, executor);
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
    await checkChore(household.id, merged, tx);

    // A one-off chore is done when the newest entry in its history is a completion. Entries from
    // when it repeated would make it done the moment it stops, so it starts over without them.
    const stopsRepeating = current.repeatEvery !== null && merged.repeat === null;
    if (stopsRepeating) await choresRepo.deleteCompletions(choreId, tx);

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
    const schedule = scheduleOf(current, latest ?? null);
    const done = markDone(schedule, today);
    annotate("chores", {
      repeats: schedule.repeat !== null,
      already_done: done.kind === "unchanged",
    });
    if (done.kind === "unchanged") return;

    await choresRepo.insertCompletion(
      { choreId, completedById: userId, completedOn: today, previousDueOn: current.dueOn },
      tx,
    );
    if (schedule.repeat) await choresRepo.updateChore(ref, { dueOn: done.dueOn }, tx);
  });
  await changed(household.id);
  return loadDetail(household.id, choreId);
}

/**
 * Skips a repeating chore this time: its due date moves one repeat on (see chore-schedule.ts) and
 * the skip goes in its history, so Undo can put the date back and nobody's credited with doing it.
 * Skipping twice the same day changes nothing, so a double tap counts once.
 */
export async function skipChore(
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
    const skipped = skip(scheduleOf(current, latest ?? null), today);
    if (skipped.kind === "not-repeating") throw notRepeating();
    annotate("chores", { already_skipped: skipped.kind === "unchanged" });
    if (skipped.kind === "unchanged") return;

    await choresRepo.insertCompletion(
      {
        choreId,
        completedById: userId,
        completedOn: today,
        previousDueOn: current.dueOn,
        skipped: true,
      },
      tx,
    );
    await choresRepo.updateChore(ref, { dueOn: skipped.dueOn }, tx);
  });
  await changed(household.id);
  return loadDetail(household.id, choreId);
}

/**
 * Removes the chore's most recent completion or skip and puts its due date back to what it was
 */
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

/** Removes the chores that are done (see isDone). Returns how many went. */
export async function clearDoneChores(userId: string): Promise<number> {
  const household = await householdsService.getMembershipOf(userId);
  const removed = await transaction(async (tx) => {
    const records = await choresRepo.findChores(household.id, tx);
    const latest = await choresRepo.findLatestCompletions(
      records.map((record) => record.id),
      tx,
    );
    const done = records.filter((record) =>
      isDone(scheduleOf(record, latest.get(record.id) ?? null)),
    );
    return choresRepo.deleteChores(
      household.id,
      done.map((record) => record.id),
      tx,
    );
  });
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
  executor?: Executor,
) {
  if (chore.repeat && !chore.dueOn) throw dueDateRequired();
  if (
    chore.assigneeId &&
    !(await householdsService.isMemberOf(householdId, chore.assigneeId, executor))
  ) {
    throw assigneeNotMember();
  }
}

async function loadDetail(
  householdId: string,
  choreId: string,
  executor?: Executor,
): Promise<ChoreDetail> {
  const record = await choresRepo.findChore({ householdId, choreId }, executor);
  if (!record) throw choreNotFound();
  const history = await choresRepo.findCompletions(choreId, HISTORY_LENGTH, executor);
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
    done: isDone(scheduleOf(record, latest)),
  };
}

/** A chore as the schedule rules see it, from its row and the newest entry in its history */
function scheduleOf(
  chore: Pick<choresRepo.ChoreRecord, "repeatEvery" | "repeatUnit" | "dueOn">,
  latest: Pick<choresRepo.CompletionRecord, "completedOn" | "skipped"> | null,
): ChoreSchedule {
  const { repeatEvery: every, repeatUnit: unit, dueOn } = chore;
  return {
    repeat: every !== null && unit !== null ? { every, unit } : null,
    dueOn,
    last: latest && { on: latest.completedOn, skipped: latest.skipped },
  };
}

function toCompletion(record: choresRepo.CompletionRecord): ChoreCompletion {
  return {
    id: record.id,
    completedBy: record.completedBy,
    completedOn: record.completedOn,
    skipped: record.skipped,
    createdAt: record.createdAt,
  };
}

/** Tells everyone in the household that its chores changed */
function changed(householdId: string, executor?: Executor) {
  return announce({ householdId, topic: "chores" }, executor);
}
