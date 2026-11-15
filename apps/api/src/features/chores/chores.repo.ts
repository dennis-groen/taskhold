// Data access for chores: the only place that queries chore tables.
// Every chore query is scoped to a household, so a chore id from another household reads as missing.
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db, type Executor, type Transaction } from "../../db/db.ts";
import { user } from "../auth/auth.table.ts";
import { householdMember } from "../households/households.table.ts";
import type { CompletionRecord, ChoreRecord } from "./chores.schema.ts";
import { chore, choreCompletion, type RepeatUnit } from "./chores.table.ts";

export type { CompletionRecord, ChoreRecord } from "./chores.schema.ts";
export type ChoreValues = Pick<
  typeof chore.$inferInsert,
  "name" | "repeatEvery" | "repeatUnit" | "dueOn" | "assigneeId"
>;

function selectChores(executor: Executor) {
  return (
    executor
      .select({
        id: chore.id,
        name: chore.name,
        repeatEvery: chore.repeatEvery,
        repeatUnit: chore.repeatUnit,
        dueOn: chore.dueOn,
        assigneeId: householdMember.userId,
        assigneeName: user.name,
        assigneeImage: user.image,
        createdAt: chore.createdAt,
      })
      .from(chore)
      // Only while they're still in this household: someone who left isn't anyone's assignee
      .leftJoin(
        householdMember,
        and(
          eq(householdMember.userId, chore.assigneeId),
          eq(householdMember.householdId, chore.householdId),
        ),
      )
      .leftJoin(user, eq(user.id, householdMember.userId))
  );
}

type ChoreRow = Awaited<ReturnType<ReturnType<typeof selectChores>["where"]>>[number];

function toChoreRecord(row: ChoreRow): ChoreRecord {
  return {
    id: row.id,
    name: row.name,
    repeatEvery: row.repeatEvery,
    repeatUnit: row.repeatUnit,
    dueOn: row.dueOn,
    assignee:
      row.assigneeId && row.assigneeName
        ? { id: row.assigneeId, name: row.assigneeName, image: row.assigneeImage }
        : null,
    createdAt: row.createdAt,
  };
}

/** Soonest due first; chores without a due date last */
export async function findChores(
  householdId: string,
  executor: Executor = db,
): Promise<ChoreRecord[]> {
  const rows = await selectChores(executor)
    .where(eq(chore.householdId, householdId))
    .orderBy(sql`${chore.dueOn} asc nulls last`, asc(chore.createdAt));
  return rows.map(toChoreRecord);
}

export async function findChore(
  ref: { householdId: string; choreId: string },
  executor: Executor = db,
): Promise<ChoreRecord | null> {
  const rows = await selectChores(executor)
    .where(and(eq(chore.id, ref.choreId), eq(chore.householdId, ref.householdId)))
    .limit(1);
  return rows[0] ? toChoreRecord(rows[0]) : null;
}

/**
 * Locks the chore until the transaction ends, so completing and undoing it happen one at a time.
 * Returns null when the household has no chore with that id.
 */
export async function lockChore(
  ref: { householdId: string; choreId: string },
  tx: Transaction,
): Promise<{
  id: string;
  repeatEvery: number | null;
  repeatUnit: RepeatUnit | null;
  dueOn: Temporal.PlainDate | null;
} | null> {
  const rows = await tx
    .select({
      id: chore.id,
      repeatEvery: chore.repeatEvery,
      repeatUnit: chore.repeatUnit,
      dueOn: chore.dueOn,
    })
    .from(chore)
    .where(and(eq(chore.id, ref.choreId), eq(chore.householdId, ref.householdId)))
    .for("update");
  return rows[0] ?? null;
}

/** Returns false when a chore with that id already exists, e.g. a retried request */
export async function insertChore(
  values: ChoreValues & Pick<typeof chore.$inferInsert, "householdId" | "id">,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(chore)
    .values(values)
    .onConflictDoNothing({ target: chore.id })
    .returning({ id: chore.id });
  return rows.length > 0;
}

/** Returns false when the household has no chore with that id */
export async function updateChore(
  ref: { householdId: string; choreId: string },
  changes: Partial<ChoreValues>,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .update(chore)
    .set(changes)
    .where(and(eq(chore.id, ref.choreId), eq(chore.householdId, ref.householdId)))
    .returning({ id: chore.id });
  return rows.length > 0;
}

/** Deletes the chore and its history (ON DELETE CASCADE). Returns false when there was no such chore. */
export async function deleteChore(
  ref: { householdId: string; choreId: string },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .delete(chore)
    .where(and(eq(chore.id, ref.choreId), eq(chore.householdId, ref.householdId)))
    .returning({ id: chore.id });
  return rows.length > 0;
}

/** Deletes these chores of the household. Returns how many went. */
export async function deleteChores(
  householdId: string,
  choreIds: string[],
  executor: Executor = db,
): Promise<number> {
  if (choreIds.length === 0) return 0;
  const rows = await executor
    .delete(chore)
    .where(and(eq(chore.householdId, householdId), inArray(chore.id, choreIds)))
    .returning({ id: chore.id });
  return rows.length;
}

const completionFields = {
  id: choreCompletion.id,
  choreId: choreCompletion.choreId,
  completedById: user.id,
  completedByName: user.name,
  completedOn: choreCompletion.completedOn,
  previousDueOn: choreCompletion.previousDueOn,
  skipped: choreCompletion.skipped,
  createdAt: choreCompletion.createdAt,
};

function selectCompletions(executor: Executor) {
  return executor
    .select(completionFields)
    .from(choreCompletion)
    .leftJoin(user, eq(user.id, choreCompletion.completedById));
}

type CompletionRow = Awaited<ReturnType<typeof selectCompletions>>[number];

function toCompletionRecord({
  completedById,
  completedByName,
  ...row
}: CompletionRow): CompletionRecord {
  return {
    ...row,
    completedBy:
      completedById && completedByName ? { id: completedById, name: completedByName } : null,
  };
}

// Newest first. createdAt alone can tie within a transaction's clock tick, so id breaks ties.
const newestFirst = [desc(choreCompletion.createdAt), desc(choreCompletion.id)];

/** The most recent completion of each of these chores, keyed by chore id */
export async function findLatestCompletions(
  choreIds: string[],
  executor: Executor = db,
): Promise<Map<string, CompletionRecord>> {
  if (choreIds.length === 0) return new Map();
  const rows = await executor
    .selectDistinctOn([choreCompletion.choreId], completionFields)
    .from(choreCompletion)
    .leftJoin(user, eq(user.id, choreCompletion.completedById))
    .where(inArray(choreCompletion.choreId, choreIds))
    .orderBy(choreCompletion.choreId, ...newestFirst);
  return new Map(rows.map((row) => [row.choreId, toCompletionRecord(row)]));
}

/** Newest first */
export async function findCompletions(
  choreId: string,
  limit: number,
  executor: Executor = db,
): Promise<CompletionRecord[]> {
  const rows = await selectCompletions(executor)
    .where(eq(choreCompletion.choreId, choreId))
    .orderBy(...newestFirst)
    .limit(limit);
  return rows.map(toCompletionRecord);
}

export async function insertCompletion(
  values: {
    choreId: string;
    completedById: string;
    completedOn: Temporal.PlainDate;
    previousDueOn: Temporal.PlainDate | null;
    skipped?: boolean;
  },
  executor: Executor = db,
): Promise<void> {
  await executor.insert(choreCompletion).values(values);
}

export async function deleteCompletion(
  completionId: string,
  executor: Executor = db,
): Promise<void> {
  await executor.delete(choreCompletion).where(eq(choreCompletion.id, completionId));
}

/** Forgets the chore's whole history. The caller has checked the chore is its household's. */
export async function deleteCompletions(choreId: string, tx: Transaction): Promise<void> {
  await tx.delete(choreCompletion).where(eq(choreCompletion.choreId, choreId));
}

export async function countChores(householdId: string, executor: Executor = db): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(chore)
    .where(eq(chore.householdId, householdId));
  return rows[0]?.total ?? 0;
}
