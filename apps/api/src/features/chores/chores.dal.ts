// Data access for chores: the only place that queries chore tables.
// Every chore query is scoped to a household, so a chore id from another household reads as missing.
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type Executor, type Transaction } from "../../db/client.ts";
import { user } from "../auth/auth.schema.ts";
import { householdMember } from "../households/households.schema.ts";
import { chore, choreCompletion, type RepeatUnit } from "./chores.schema.ts";

export type ChoreRecord = {
  id: string;
  name: string;
  repeatEvery: number | null;
  repeatUnit: RepeatUnit | null;
  dueOn: Temporal.PlainDate | null;
  /** Null when nobody is assigned, or the assignee has left the household */
  assignee: { id: string; name: string; image: string | null } | null;
  createdAt: Temporal.Instant;
};

export type CompletionRecord = {
  id: string;
  choreId: string;
  completedBy: { id: string; name: string } | null;
  completedOn: Temporal.PlainDate;
  previousDueOn: Temporal.PlainDate | null;
  createdAt: Temporal.Instant;
};

export type ChoreValues = {
  name: string;
  repeatEvery: number | null;
  repeatUnit: RepeatUnit | null;
  dueOn: Temporal.PlainDate | null;
  assigneeId: string | null;
};

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

export async function insertChore(
  values: ChoreValues & { householdId: string },
  executor: Executor = db,
): Promise<{ id: string }> {
  const rows = await executor.insert(chore).values(values).returning({ id: chore.id });
  // An insert without a conflict target always returns its row
  return rows[0];
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

/** Deletes one-off chores that have been done. Returns how many went. */
export async function deleteDoneOneOffChores(
  householdId: string,
  executor: Executor = db,
): Promise<number> {
  const done = executor
    .select({ choreId: choreCompletion.choreId })
    .from(choreCompletion)
    .innerJoin(chore, eq(chore.id, choreCompletion.choreId))
    .where(and(eq(chore.householdId, householdId), isNull(chore.repeatEvery)));
  const rows = await executor
    .delete(chore)
    .where(
      and(eq(chore.householdId, householdId), isNull(chore.repeatEvery), inArray(chore.id, done)),
    )
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
  createdAt: choreCompletion.createdAt,
};

type CompletionRow = {
  id: string;
  choreId: string;
  completedById: string | null;
  completedByName: string | null;
  completedOn: Temporal.PlainDate;
  previousDueOn: Temporal.PlainDate | null;
  createdAt: Temporal.Instant;
};

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
  const rows = await executor
    .select(completionFields)
    .from(choreCompletion)
    .leftJoin(user, eq(user.id, choreCompletion.completedById))
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
