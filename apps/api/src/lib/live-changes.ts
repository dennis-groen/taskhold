// Tells open live-update streams (features/live) that something changed, through Postgres
// LISTEN/NOTIFY, so a change made through any API instance reaches people connected to any other.
//
// A change says only which part of the app changed and for whom, never what: apps refetch through
// the normal endpoints, which check who may see what.
import { sql } from "drizzle-orm";
import { Client } from "pg";

import { env } from "../config/env.ts";
import { db, type Executor } from "../db/client.ts";
import { logger } from "./logger.ts";
import { describeError } from "./wide-event.ts";

const CHANNEL = "taskhold_changes";
const RECONNECT_DELAY = Temporal.Duration.from({ seconds: 2 });

/** The parts of the app a change can be in, which apps refetch as a whole */
export type Topic = "shopping" | "chores" | "todos" | "household";

/** Who should hear about a change: everyone in a household, or one person on all their devices */
export type Change =
  | { householdId: string; topic: Topic }
  | { userId: string; topic: Topic }
  // The account was deleted: its streams close
  | { userId: string; topic: "account" };

export type FeedEvent =
  | { type: "change"; change: Change }
  // The feed lost its database connection for a while and changes may have been missed
  | { type: "resync" }
  // The server is shutting down
  | { type: "close" };

/**
 * Announces a change. Given a transaction, Postgres only delivers it if and when the transaction
 * commits, so nobody refetches before the change is visible or hears about one rolled back.
 * Failing to announce doesn't fail the change: apps still refetch on focus and reconnect.
 */
export async function announce(change: Change, executor: Executor = db): Promise<void> {
  try {
    await executor.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(change)})`);
  } catch (err) {
    // Inside a transaction the error aborts it, so let the caller roll back
    if (executor !== db) throw err;
    logger.warn({ error: describeError(err), change }, "Couldn't announce a change");
  }
}

type Listener = (event: FeedEvent) => void;

const listeners = new Set<Listener>();
let client: Client | null = null;
let connecting: Promise<void> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
// Set while the feed isn't listening, so listeners hear that they may have missed changes
let missedChanges = false;
let stopped = false;

/**
 * Calls `listener` for every change from now on. Resolves once the feed is listening, so nothing
 * announced after that is missed. Returns the function that stops listening.
 */
export async function watch(listener: Listener): Promise<() => void> {
  listeners.add(listener);
  await ensureListening();
  return () => listeners.delete(listener);
}

/** For shutdown and tests: tells every listener to close, and lets go of the connection */
export async function stopFeed(): Promise<void> {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  for (const listener of listeners) listener({ type: "close" });
  listeners.clear();
  const current = client;
  client = null;
  await current?.end().catch(() => {});
}

function ensureListening(): Promise<void> {
  if (client) return Promise.resolve();
  connecting ??= connect().finally(() => {
    connecting = null;
  });
  return connecting;
}

async function connect(): Promise<void> {
  if (stopped) return;
  const candidate = new Client({ connectionString: env.DATABASE_URL });
  candidate.on("notification", (message) => {
    const change = parse(message.payload);
    if (!change) return;
    for (const listener of listeners) listener({ type: "change", change });
  });
  candidate.on("error", (err) => {
    logger.warn({ error: describeError(err) }, "Live changes lost their database connection");
    disconnected(candidate);
  });
  candidate.on("end", () => disconnected(candidate));

  try {
    await candidate.connect();
    await candidate.query(`LISTEN ${CHANNEL}`);
  } catch (err) {
    logger.warn({ error: describeError(err) }, "Live changes couldn't listen to the database");
    await candidate.end().catch(() => {});
    missedChanges = true;
    scheduleReconnect();
    return;
  }

  client = candidate;
  if (missedChanges) for (const listener of listeners) listener({ type: "resync" });
  missedChanges = false;
}

function disconnected(candidate: Client) {
  if (client !== candidate) return;
  client = null;
  missedChanges = true;
  void candidate.end().catch(() => {});
  scheduleReconnect();
}

function scheduleReconnect() {
  // Nobody listening: the next watch() connects again
  if (stopped || reconnectTimer || listeners.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureListening();
  }, RECONNECT_DELAY.total("milliseconds"));
}

function parse(payload: string | undefined): Change | null {
  try {
    const value: unknown = JSON.parse(payload ?? "");
    if (typeof value !== "object" || value === null || !("topic" in value)) return null;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only announce() writes to the channel
    return value as Change;
  } catch {
    return null;
  }
}
