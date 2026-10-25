import { Hono } from "hono";
import { logger } from "hono/logger";

import { auth } from "./auth.ts";
import { onError } from "./lib/errors.ts";
import { requireAuth } from "./middleware/require-auth.ts";
import { householdRoutes } from "./routes/households.ts";
import { viewerRoutes } from "./routes/viewer.ts";

export const app = new Hono()
  .basePath("/api")
  .onError(onError)
  .use(logger())
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .all("/auth/*", (c) => auth.handler(c.req.raw))
  .route("/", viewerRoutes)
  // Every route registered below this line requires a signed-in user
  .use(requireAuth)
  .route("/", householdRoutes);
