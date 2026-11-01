import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "../config/env.ts";
import { logger } from "../lib/logger.ts";
import { countQuery, describeError } from "../lib/wide-event.ts";
import * as schema from "./schema.ts";

// Nothing the app does takes more than a few milliseconds, so anything slower is stuck. Without
// limits, a stuck query or a transaction left open would hold its connection (and row locks)
// forever, and once all 10 connections are held every request waits.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Waiting for a free connection, or for Postgres to accept one
  connectionTimeoutMillis: 5_000,
  // Postgres cancels any single statement after this, including one waiting on a row lock
  statement_timeout: 10_000,
  // Postgres ends a session that sits in an open transaction without sending anything
  idle_in_transaction_session_timeout: 10_000,
});

// An idle connection can fail (Postgres restarted, network dropped). Without a listener that's an
// unhandled 'error' event and the process crashes; with one, the pool replaces the connection.
pool.on("error", (err) => {
  logger.error({ error: describeError(err) }, "Idle database connection failed");
});

// Counts queries per request for the wide event. Query text and parameters aren't logged.
export const db = drizzle({ client: pool, schema, logger: { logQuery: countQuery } });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that can run queries. DAL functions take one so services can pass a transaction. */
export type Executor = Database | Transaction;

/** Runs `work` in one database transaction; throwing inside rolls everything back. */
export function transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(work);
}
