// Test helpers: signed-in test users and a typed client that calls the app in-process.
import { createHmac, randomUUID } from "node:crypto";

import type { ClientResponse } from "hono/client";
import { testClient } from "hono/testing";
import { afterAll } from "vitest";

import { app } from "../src/app.ts";
import { env } from "../src/env.ts";
import { db, pool } from "../src/db/db.ts";
import { account, session, user } from "../src/features/auth/auth.table.ts";

// Every test file gets its own pool; close it so Vitest can exit
afterAll(() => pool.end());

export type TestUser = {
  id: string;
  name: string;
  /** The session cookie, for requests made without the typed client */
  cookie: string;
  api: ReturnType<typeof clientFor>;
};

/** The API as an anonymous visitor would call it from the app's own origin */
export const anonymous = clientFor({});

/**
 * A new user with a session and a Google account, the way Better Auth stores them after Google
 * sign-in. Pass the same `googleId` to sign the same Google login up again (e.g. after deleting
 * the account). The session cookie is the token plus its HMAC-SHA256 signature, as Better Auth
 * signs it.
 */
export async function signUp(
  name = "Test Person",
  { googleId = randomUUID() }: { googleId?: string } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const token = randomUUID();
  const now = Temporal.Now.instant();
  await db.insert(user).values({
    id,
    name,
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: toDate(now),
    updatedAt: toDate(now),
  });
  await db.insert(account).values({
    id: randomUUID(),
    accountId: googleId,
    providerId: "google",
    userId: id,
    createdAt: toDate(now),
    updatedAt: toDate(now),
  });
  await db.insert(session).values({
    id: randomUUID(),
    token,
    userId: id,
    expiresAt: toDate(now.add({ hours: 1 })),
    createdAt: toDate(now),
    updatedAt: toDate(now),
  });

  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET).update(token).digest("base64");
  const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
  return { id, name, cookie, api: clientFor({ cookie }) };
}

/** A household with `owner` in it, plus `members` who joined with its invite code */
export async function householdWith(owner: TestUser, ...members: TestUser[]) {
  const created = await owner.api.households.$post({ json: { name: "Test home" } });
  const { household } = await json(created, 201);
  for (const member of members) {
    const joined = await member.api.households.invites[":code"].accept.$post({
      param: { code: household.inviteCode },
    });
    await json(joined, 200);
  }
  return household;
}

/** Today in UTC, which the API always accepts as "today" */
export function utcToday(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO("UTC");
}

/** The body type a typed response has for `status` */
type BodyFor<Response, Status extends number> =
  Response extends ClientResponse<infer Body, infer ResponseStatus>
    ? Status extends ResponseStatus
      ? Body
      : never
    : never;

/** Asserts the status, then returns the body the API declares for it */
export async function json<Response extends ClientResponse<unknown, number>, Status extends number>(
  response: Response,
  status: Status,
): Promise<BodyFor<Response, Status>> {
  const body: unknown = await response.json();
  if (response.status !== status) {
    throw new Error(`Expected ${status}, got ${response.status}: ${JSON.stringify(body)}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the status check above is what narrows it
  return body as BodyFor<Response, Status>;
}

/** The error code of an error response, after checking its status */
export async function errorCode(
  response: { status: number; json(): Promise<unknown> },
  status: number,
): Promise<string> {
  const body: unknown = await response.json();
  if (response.status !== status) {
    throw new Error(`Expected ${status}, got ${response.status}: ${JSON.stringify(body)}`);
  }
  const error: unknown =
    typeof body === "object" && body !== null && "error" in body ? body.error : null;
  const code: unknown =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (typeof code !== "string") throw new Error(`No error code in ${JSON.stringify(body)}`);
  return code;
}

// Better Auth's tables hold Dates: it reads and writes them itself (see ARCHITECTURE.md)
function toDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function clientFor(headers: Record<string, string>) {
  return testClient(app, undefined, undefined, {
    // Every state-changing request must come from the app's origin
    headers: { origin: new URL(env.BETTER_AUTH_URL).origin, ...headers },
  }).api;
}
