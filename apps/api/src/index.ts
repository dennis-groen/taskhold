import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { auth } from "./auth.ts";
import { env } from "./env.ts";
import { requireAuth } from "./middleware/require-auth.ts";

const app = new Hono()
  .basePath("/api")
  .use(logger())
  .get("/health", (c) => c.json({ status: "ok" }))
  .all("/auth/*", (c) => auth.handler(c.req.raw))
  // Every route registered below this line requires a signed-in user
  .use(requireAuth)
  .get("/me", (c) => c.json({ user: c.get("user") }));

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API running on http://localhost:${info.port}`);
});
