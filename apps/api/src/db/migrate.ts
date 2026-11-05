// Applies pending migrations from ./drizzle, then exits. The container runs this before starting
// the API, so each deploy brings the schema up to date. Locally, `pnpm db:migrate` (drizzle-kit)
// does the same.
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { logger } from "../lib/logger.ts";
import { db, pool } from "./db.ts";

// apps/api/drizzle, from both src/db and dist/db
const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

try {
  await migrate(db, { migrationsFolder });
  logger.info({ migrationsFolder }, "Database migrations applied");
} finally {
  await pool.end();
}
