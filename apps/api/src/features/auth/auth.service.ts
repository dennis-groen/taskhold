import type { Executor, Transaction } from "../../db/db.ts";
import { annotate } from "../../lib/wide-event.ts";
import { getIP } from "better-auth/api";

import * as authRepo from "./auth.repo.ts";
import { auth, type Session } from "./auth.ts";

/** The session behind a request's cookies, or null when nobody is signed in */
export async function getSession(headers: Headers): Promise<Session | null> {
  const session = await auth.api.getSession({ headers });
  if (session) annotate("user", { id: session.user.id });
  return session;
}

/**
 * The client's IP address as Better Auth works it out and records it on sessions (an IPv6 address
 * cut to its /64), from headers that carry the chain we vouch for (lib/connection.ts). Null when it
 * can't tell.
 */
export function clientIpOf(headers: Headers): string | null {
  return getIP(headers, auth.options);
}

/** Whether the user is one of the demo's anonymous accounts */
export function isAnonymous(userId: string, executor?: Executor): Promise<boolean> {
  return authRepo.isAnonymous(userId, executor);
}

/**
 * Signs a new anonymous (demo) account in, through Better Auth so its session is made and signed
 * the usual way. `headers` must carry the client IP chain (lib/connection.ts), which Better Auth
 * stores on the session. Returns the account and the cookies that hold its session.
 */
export async function signInAnonymously(
  headers: Headers,
): Promise<{ userId: string; cookies: string[] }> {
  const response = await auth.api.signInAnonymous({ headers, asResponse: true });
  if (!response.ok) throw new Error(`Anonymous sign-in failed with ${response.status}`);
  const body: unknown = await response.json();
  const userId =
    typeof body === "object" && body !== null && "user" in body && isRecord(body.user)
      ? body.user.id
      : undefined;
  if (typeof userId !== "string") throw new Error("Anonymous sign-in returned no user");
  return { userId, cookies: response.headers.getSetCookie() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
