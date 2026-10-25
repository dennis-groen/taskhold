import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "../config/env.ts";
import * as schema from "./schema.ts";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anything that can run queries. DAL functions take one so services can pass a transaction. */
export type Executor = Database | Transaction;

/** Runs `work` in one database transaction; throwing inside rolls everything back. */
export function transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(work);
}
