// Data access for households: the only place that queries household tables.
// Functions return plain records and take an optional executor so services can run them in a transaction.
import { and, asc, count, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

import { db, type Executor, type Transaction } from "../../db/db.ts";
import { isUniqueViolation } from "../../db/pg-errors.ts";
import { household, householdMember, inviteCodeAttempt } from "./households.table.ts";
import type { HouseholdRecord, MembershipRecord } from "./households.schema.ts";

export type { HouseholdRecord, MembershipRecord } from "./households.schema.ts";

export async function findMembershipByUserId(
  userId: string,
  executor: Executor = db,
): Promise<MembershipRecord | null> {
  const rows = await executor
    .select({
      householdId: household.id,
      householdName: household.name,
      role: householdMember.role,
    })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(eq(householdMember.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Whether the user is currently a member of this household */
export async function isMember(
  ref: { householdId: string; userId: string },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .select({ id: householdMember.id })
    .from(householdMember)
    .where(
      and(eq(householdMember.householdId, ref.householdId), eq(householdMember.userId, ref.userId)),
    )
    .limit(1);
  return rows.length > 0;
}

export function findHouseholdById(householdId: string, executor: Executor = db) {
  return findHousehold({ id: householdId }, executor);
}

export function findHouseholdByInviteCode(inviteCode: string, executor: Executor = db) {
  return findHousehold({ inviteCode }, executor);
}

async function findHousehold(
  where: { id: string } | { inviteCode: string },
  executor: Executor,
): Promise<HouseholdRecord | null> {
  const row = await executor.query.household.findFirst({
    where,
    with: {
      members: {
        with: { user: { columns: { id: true, name: true, image: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    inviteCode: row.inviteCode,
    demo: row.demo,
    members: row.members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      image: member.user.image,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
  };
}

/** Returns null when the invite code is already taken, so the caller can try another */
export async function insertHousehold(
  values: Pick<typeof household.$inferInsert, "name" | "inviteCode" | "demo">,
  executor: Executor = db,
): Promise<{ id: string } | null> {
  const rows = await executor
    .insert(household)
    .values(values)
    .onConflictDoNothing({ target: household.inviteCode })
    .returning({ id: household.id });
  return rows[0] ?? null;
}

/** Returns false when the user already belongs to a household (one per user, enforced by the database) */
export async function insertMember(
  values: Pick<typeof householdMember.$inferInsert, "householdId" | "userId" | "role">,
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .insert(householdMember)
    .values(values)
    .onConflictDoNothing({ target: householdMember.userId })
    .returning({ id: householdMember.id });
  return rows.length > 0;
}

/**
 * Locks the household row until the transaction ends, so membership changes to one household
 * happen one at a time. Returns null when the household no longer exists.
 */
export async function lockHousehold(
  householdId: string,
  tx: Transaction,
): Promise<{ inviteCode: string } | null> {
  const rows = await tx
    .select({ inviteCode: household.inviteCode })
    .from(household)
    .where(eq(household.id, householdId))
    .for("update");
  return rows[0] ?? null;
}

/**
 * Holds the household row until the transaction ends, so nobody can leave or be removed (which
 * takes lockHousehold) meanwhile. Holders don't wait for each other. Returns false when the
 * household no longer exists.
 */
export async function shareHousehold(householdId: string, tx: Transaction): Promise<boolean> {
  const rows = await tx
    .select({ id: household.id })
    .from(household)
    .where(eq(household.id, householdId))
    .for("key share");
  return rows.length > 0;
}

/** The member who joined first, or null when nobody is left */
export async function findEarliestMember(
  householdId: string,
  executor: Executor = db,
): Promise<{ userId: string } | null> {
  const rows = await executor
    .select({ userId: householdMember.userId })
    .from(householdMember)
    .where(eq(householdMember.householdId, householdId))
    .orderBy(asc(householdMember.joinedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns false when the user wasn't a member of that household */
export async function deleteMember(
  values: { householdId: string; userId: string },
  executor: Executor = db,
): Promise<boolean> {
  const rows = await executor
    .delete(householdMember)
    .where(
      and(
        eq(householdMember.householdId, values.householdId),
        eq(householdMember.userId, values.userId),
      ),
    )
    .returning({ id: householdMember.id });
  return rows.length > 0;
}

export async function setMemberRole(
  values: Pick<typeof householdMember.$inferInsert, "householdId" | "userId" | "role">,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(householdMember)
    .set({ role: values.role })
    .where(
      and(
        eq(householdMember.householdId, values.householdId),
        eq(householdMember.userId, values.userId),
      ),
    );
}

/** Deletes the household; its memberships go with it (ON DELETE CASCADE) */
export async function deleteHousehold(householdId: string, executor: Executor = db): Promise<void> {
  await executor.delete(household).where(eq(household.id, householdId));
}

/** Returns false when another household already uses the new code, so the caller can try another */
export async function updateInviteCode(
  householdId: string,
  inviteCode: string,
  executor: Executor = db,
): Promise<boolean> {
  try {
    // A savepoint, so a duplicate code doesn't abort the caller's transaction
    await executor.transaction(async (savepoint) => {
      await savepoint.update(household).set({ inviteCode }).where(eq(household.id, householdId));
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err, "household_invite_code_unique")) return false;
    throw err;
  }
}

/**
 * Takes a lock on one person's invite guesses until the transaction ends, so their concurrent
 * lookups count and record misses one at a time instead of all reading the same count
 */
export async function lockInviteAttempts(identity: string, tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identity}, 0))`);
}

/** How many codes this person tried since `since` that matched no household */
export async function countFailedInviteAttempts(
  identity: string,
  since: Temporal.Instant,
  executor: Executor = db,
): Promise<number> {
  const rows = await executor
    .select({ count: count() })
    .from(inviteCodeAttempt)
    .where(
      and(eq(inviteCodeAttempt.identity, identity), gte(inviteCodeAttempt.attemptedAt, since)),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Records a code that matched no household, and drops this person's attempts older than
 * `prunedBefore` (and old rows from before attempts had an identity)
 */
export async function recordFailedInviteAttempt(
  identity: string,
  prunedBefore: Temporal.Instant,
  executor: Executor = db,
): Promise<void> {
  await executor.insert(inviteCodeAttempt).values({ identity });
  await executor
    .delete(inviteCodeAttempt)
    .where(
      and(
        or(eq(inviteCodeAttempt.identity, identity), isNull(inviteCodeAttempt.identity)),
        lt(inviteCodeAttempt.attemptedAt, prunedBefore),
      ),
    );
}
