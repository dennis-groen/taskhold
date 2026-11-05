import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "./db.ts";

afterAll(() => pool.end());

async function setting(name: string) {
  const { rows } = await db.execute<{ value: string }>(
    sql`select current_setting(${name}) as value`,
  );
  return rows[0]?.value;
}

describe("database connections", () => {
  it("time out stuck statements and idle transactions", async () => {
    expect(await setting("statement_timeout")).toBe("10s");
    expect(await setting("idle_in_transaction_session_timeout")).toBe("10s");
  });

  it("cancels a statement that runs past the limit", async () => {
    // Lowered for this transaction only, so the test doesn't wait 10 seconds
    const slow = db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = 100`);
      await tx.execute(sql`select pg_sleep(1)`);
    });
    // 57014 is Postgres's query_canceled; Drizzle wraps the pg error as its cause
    await expect(slow).rejects.toMatchObject({ cause: { code: "57014" } });
  });
});
