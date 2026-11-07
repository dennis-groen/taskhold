// Data access for accounts. Better Auth reads and writes its own tables; this is only for what the
// app does to them itself.
import { asc, eq } from "drizzle-orm";

import { db, type Executor } from "../../db/db.ts";
import { account, user } from "./auth.table.ts";

/**
 * Deletes the account. The database removes what belongs to the person alone (sessions, sign-in
 * accounts, membership, private to-dos) and keeps what they did in a household with their name
 * cleared (items added or checked, chores done, chores assigned).
 */
export async function deleteUser(userId: string, executor: Executor = db): Promise<boolean> {
  const rows = await executor.delete(user).where(eq(user.id, userId)).returning({ id: user.id });
  return rows.length > 0;
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
