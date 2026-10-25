import { Hono } from "hono";
import { logger } from "hono/logger";

import { authRoutes } from "./features/auth/auth.routes.ts";
import { householdRoutes } from "./features/households/households.routes.ts";
import { viewerRoutes } from "./features/viewer/viewer.routes.ts";
import { errorHandler } from "./lib/error-handler.ts";

// Each feature owns a path prefix and decides its own auth (see protectedRouter)
export const app = new Hono()
  .basePath("/api")
  .onError(errorHandler)
  .use(logger())
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .route("/auth", authRoutes)
  .route("/viewer", viewerRoutes)
  .route("/households", householdRoutes);
