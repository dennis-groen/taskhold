// Data access for accounts. Better Auth reads and writes its own tables; this is only for what the
// app does to them itself.
import { and, asc, eq, ne } from "drizzle-orm";

import { db, type Executor } from "../../db/db.ts";
import { account, session, user } from "./auth.table.ts";

/**
 * Deletes the account. The database removes what belongs to the person alone (sessions, sign-in
 * accounts, membership, private to-dos) and keeps what they did in a household with their name
 * cleared (items added or checked, chores done, chores assigned).
 */
export async function deleteUser(userId: string, executor: Executor = db): Promise<boolean> {
  const rows = await executor.delete(user).where(eq(user.id, userId)).returning({ id: user.id });
  return rows.length > 0;
}

/** Whether the user is one of the demo's anonymous accounts (false for a user that doesn't exist) */
export async function isAnonymous(userId: string, executor: Executor = db): Promise<boolean> {
  const rows = await executor
    .select({ isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.isAnonymous === true;
}

/** The person's oldest sign-in account (provider and the provider's id for them), if any */
export async function findFirstAccount(
  userId: string,
  executor: Executor = db,
): Promise<{ providerId: string; accountId: string } | null> {
  const rows = await executor
    .select({ providerId: account.providerId, accountId: account.accountId })
    .from(account)
    .where(eq(account.userId, userId))
    .orderBy(asc(account.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Ends every session of the person except `keepSessionId`. Returns how many ended. */
export async function deleteOtherSessions(
  userId: string,
  keepSessionId: string,
  executor: Executor = db,
): Promise<number> {
  const rows = await executor
    .delete(session)
    .where(and(eq(session.userId, userId), ne(session.id, keepSessionId)))
    .returning({ id: session.id });
  return rows.length;
}
