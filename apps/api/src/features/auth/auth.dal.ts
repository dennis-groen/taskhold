// Data access for accounts. Better Auth reads and writes its own tables; this is only for what the
// app does to them itself.
import { eq } from "drizzle-orm";

import { db, type Executor } from "../../db/client.ts";
import { user } from "./auth.schema.ts";

/**
 * Deletes the account. The database removes what belongs to the person alone (sessions, sign-in
 * accounts, membership, private to-dos) and keeps what they did in a household with their name
 * cleared (items added or checked, chores done, chores assigned).
 */
export async function deleteUser(userId: string, executor: Executor = db): Promise<boolean> {
  const rows = await executor.delete(user).where(eq(user.id, userId)).returning({ id: user.id });
  return rows.length > 0;
}
