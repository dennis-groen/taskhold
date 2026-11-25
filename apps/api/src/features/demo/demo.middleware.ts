import { createMiddleware } from "hono/factory";

import { spendDemoWrite } from "./demo.service.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Puts a demo visitor's changes against their demo's budget (DEMO_WRITE_BUDGET), so one demo can
 * only ever write so much. Runs after requireAuth; everyone else passes straight through.
 */
export const limitDemoWrites = createMiddleware<{
  Variables: { user: { id: string; isAnonymous?: boolean | null } };
}>(async (c, next) => {
  const user = c.get("user");
  if (user.isAnonymous === true && !SAFE_METHODS.has(c.req.method)) {
    await spendDemoWrite(user.id);
  }
  await next();
});
