import type { Executor, Transaction } from "../../db/db.ts";
import { annotate } from "../../lib/wide-event.ts";
import * as authRepo from "./auth.repo.ts";
import { auth, type Session } from "./auth.ts";

/** The session behind a request's cookies, or null when nobody is signed in */
export async function getSession(headers: Headers): Promise<Session | null> {
  const session = await auth.api.getSession({ headers });
  if (session) annotate("user", { id: session.user.id });
  return session;
}

/** Deletes the account, in the caller's transaction (see auth.repo.ts for what goes with it) */
export function deleteUser(userId: string, tx: Transaction): Promise<boolean> {
  return authRepo.deleteUser(userId, tx);
}

/**
 * Who signed in, as the identity provider knows them, e.g. "google:1234". Unlike the user id it
 * stays the same when someone deletes their account and signs in again, so limits that must
 * survive that (like the invite guess budget) are keyed by it.
 */
export async function signInIdentityOf(userId: string, executor?: Executor): Promise<string> {
  const first = await authRepo.findFirstAccount(userId, executor);
  return first ? `${first.providerId}:${first.accountId}` : `user:${userId}`;
}

/** Signs the person out everywhere except the session that asked. Returns how many sessions ended. */
export function endOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  return authRepo.deleteOtherSessions(userId, keepSessionId);
}
