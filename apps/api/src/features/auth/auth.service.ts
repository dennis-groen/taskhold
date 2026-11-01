import type { Transaction } from "../../db/client.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as authDal from "./auth.dal.ts";
import { auth, type Session } from "./auth.ts";

/** The session behind a request's cookies, or null when nobody is signed in */
export async function getSession(headers: Headers): Promise<Session | null> {
  const session = await auth.api.getSession({ headers });
  if (session) annotate("user", { id: session.user.id });
  return session;
}

/** Deletes the account, in the caller's transaction (see auth.dal.ts for what goes with it) */
export function deleteUser(userId: string, tx: Transaction): Promise<boolean> {
  return authDal.deleteUser(userId, tx);
}
