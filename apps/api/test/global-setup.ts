// Runs once before all tests: creates the test database if needed, applies every migration, and
// empties the app's tables so each run starts clean. Tests make their own users and households.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import type { TestProject } from "vitest/node";

export default async function setup(project: TestProject) {
  const url = new URL(String(project.config.env.DATABASE_URL));
  const database = url.pathname.slice(1);
  // Every table gets emptied below, so never run against a database that isn't meant for tests
  if (!database.endsWith("_test")) {
    const reason = `Refusing to run tests against "${database}": its name must end in _test`;
    // Printed as well as thrown: Vitest can fail to format errors thrown from global setup
    console.error(reason);
    throw new Error(reason);
  }

  // CREATE DATABASE can't run inside the database it creates, so connect to the default one
  const admin = new Client({ connectionString: new URL("/postgres", url).toString() });
  await admin.connect();
  try {
    const exists = await admin.query("select 1 from pg_database where datname = $1", [database]);
    if (exists.rowCount === 0) await admin.query(`create database "${database}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: url.toString() });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
    });
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    const tables = rows.map(({ tablename }) => `"${tablename}"`).join(", ");
    if (tables) await pool.query(`truncate ${tables} cascade`);
  } finally {
    await pool.end();
  }
}
