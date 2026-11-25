// Data access for demo households. A demo is a sandbox the demo feature makes and deletes whole,
// so this repo writes the seed straight into the other features' tables (their services can't
// backdate history) and deletes the sandbox along with its anonymous members. Everything a visitor
// does inside the demo still goes through the other features' services.
import { and, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { db, type Executor, type Transaction } from "../../db/db.ts";
import { user } from "../auth/auth.table.ts";
import { chore, choreCompletion } from "../chores/chores.table.ts";
import { household, householdMember } from "../households/households.table.ts";
import {
  shoppingItem,
  shoppingList,
  shoppingPurchase,
  shoppingTrip,
} from "../shopping/shopping.table.ts";
import { todo } from "../todos/todos.table.ts";
import type { DemoSeed } from "./demo-seed.ts";

/**
 * Made-up housemates: anonymous accounts with no session or sign-in account, so nobody can ever
 * be them. Returns their ids in the order given.
 */
export async function insertHousemates(names: string[], tx: Transaction): Promise<string[]> {
  const rows = names.map((name) => {
    const id = crypto.randomUUID();
    return { id, name, email: `housemate-${id}@demo.invalid`, isAnonymous: true };
  });
  await tx.insert(user).values(rows);
  return rows.map((row) => row.id);
}

/** Fills a new demo household with its lists, history, chores and the visitor's to-dos */
export async function insertSeed(
  target: { householdId: string; visitorId: string },
  seed: DemoSeed,
  tx: Transaction,
): Promise<void> {
  const { householdId, visitorId } = target;
  await tx.insert(shoppingList).values(seed.lists.map((list) => ({ ...list, householdId })));
  await tx.insert(shoppingItem).values(seed.items);
  await tx
    .insert(shoppingPurchase)
    .values(seed.purchases.map((bought) => ({ id: crypto.randomUUID(), householdId, ...bought })));
  // Already announced, so nobody gets a push for it
  await tx
    .insert(shoppingTrip)
    .values({ id: crypto.randomUUID(), householdId, notified: true, ...seed.trip });

  await tx.insert(chore).values(
    seed.chores.map(({ history: _history, repeat, ...rest }) => ({
      ...rest,
      householdId,
      repeatEvery: repeat?.every ?? null,
      repeatUnit: repeat?.unit ?? null,
    })),
  );
  const completions = seed.chores.flatMap(({ id, history }) =>
    history.map((entry) => ({ choreId: id, ...entry })),
  );
  if (completions.length > 0) await tx.insert(choreCompletion).values(completions);

  await tx.insert(todo).values(seed.todos.map((entry) => ({ ...entry, userId: visitorId })));
}

/** How many demo households exist right now */
export async function countDemoHouseholds(executor: Executor = db): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(household)
    .where(eq(household.demo, true));
  return rows[0]?.total ?? 0;
}

/**
 * How many demo households started from this address exist right now. Counted by household rather
 * than by session, so signing out of a demo doesn't free its place: the household stays until it
 * ends or expires.
 */
export async function countDemoHouseholdsFrom(
  ip: string,
  executor: Executor = db,
): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(household)
    .where(and(eq(household.demo, true), eq(household.demoIp, ip)));
  return rows[0]?.total ?? 0;
}

/** Records the address a demo household was started from */
export async function recordDemoIp(
  householdId: string,
  ip: string,
  tx: Transaction,
): Promise<void> {
  await tx.update(household).set({ demoIp: ip }).where(eq(household.id, householdId));
}

/**
 * Takes the lock on starting demos until the transaction ends, on every API instance, so a burst
 * of starts counts the demos one at a time instead of all reading the same count
 */
export async function lockDemoStarts(tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('demo-start', 0))`);
}

/**
 * Counts one more change against the user's demo household and returns how many it has had,
 * including this one. Null when the user isn't in a demo household.
 */
export async function spendDemoWrite(
  userId: string,
  executor: Executor = db,
): Promise<number | null> {
  const rows = await executor
    .update(household)
    .set({ demoWrites: sql`${household.demoWrites} + 1` })
    .where(
      and(
        eq(household.demo, true),
        inArray(
          household.id,
          executor
            .select({ id: householdMember.householdId })
            .from(householdMember)
            .where(eq(householdMember.userId, userId)),
        ),
      ),
    )
    .returning({ writes: household.demoWrites });
  return rows[0]?.writes ?? null;
}

export type DemoHousehold = {
  id: string;
  createdAt: Temporal.Instant;
  memberIds: string[];
};

/** The demo household the user is in, or null when they aren't in one */
export async function findDemoHouseholdOf(
  userId: string,
  executor: Executor = db,
): Promise<DemoHousehold | null> {
  const rows = await executor
    .select({ id: household.id, createdAt: household.createdAt })
    .from(householdMember)
    .innerJoin(household, eq(household.id, householdMember.householdId))
    .where(and(eq(householdMember.userId, userId), eq(household.demo, true)))
    .limit(1);
  const found = rows[0];
  if (!found) return null;
  return { ...found, memberIds: await memberIdsOf([found.id], executor) };
}

/** Demo households made before `cutoff`, oldest first, at most `limit` of them */
export async function findDemoHouseholdsBefore(
  cutoff: Temporal.Instant,
  limit: number,
  executor: Executor = db,
): Promise<DemoHousehold[]> {
  const rows = await executor
    .select({ id: household.id, createdAt: household.createdAt })
    .from(household)
    .where(and(eq(household.demo, true), lt(household.createdAt, cutoff)))
    .orderBy(household.createdAt)
    .limit(limit);
  if (rows.length === 0) return [];
  const members = await executor
    .select({ householdId: householdMember.householdId, userId: householdMember.userId })
    .from(householdMember)
    .where(
      inArray(
        householdMember.householdId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => ({
    ...row,
    memberIds: members.filter((m) => m.householdId === row.id).map((m) => m.userId),
  }));
}

/**
 * Anonymous accounts made before `cutoff` that aren't in any household: a visitor whose demo was
 * never seeded, or a housemate removed from one. At most `limit` of them.
 */
export async function findStrayAnonymousUsersBefore(
  cutoff: Temporal.Instant,
  limit: number,
  executor: Executor = db,
): Promise<string[]> {
  const rows = await executor
    .select({ id: user.id })
    .from(user)
    .leftJoin(householdMember, eq(householdMember.userId, user.id))
    .where(
      and(
        eq(user.isAnonymous, true),
        isNull(householdMember.id),
        sql`${user.createdAt} < ${cutoff.toString()}::timestamptz at time zone 'UTC'`,
      ),
    )
    .limit(limit);
  return rows.map((row) => row.id);
}

/**
 * Deletes demo households and anonymous accounts. Only rows marked as demo or anonymous are
 * touched, whatever ids are passed. What's theirs goes with them (lists, chores, to-dos,
 * sessions, push devices) through the database's cascades.
 */
export async function deleteDemos(
  target: { householdIds: string[]; userIds: string[] },
  tx: Transaction,
): Promise<void> {
  if (target.householdIds.length > 0) {
    await tx
      .delete(household)
      .where(and(inArray(household.id, target.householdIds), eq(household.demo, true)));
  }
  if (target.userIds.length > 0) {
    await tx.delete(user).where(and(inArray(user.id, target.userIds), eq(user.isAnonymous, true)));
  }
}

async function memberIdsOf(householdIds: string[], executor: Executor): Promise<string[]> {
  const rows = await executor
    .select({ userId: householdMember.userId })
    .from(householdMember)
    .where(inArray(householdMember.householdId, householdIds));
  return rows.map((row) => row.userId);
}
