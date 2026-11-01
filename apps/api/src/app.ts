import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { authRoutes } from "./features/auth/auth.routes.ts";
import { householdRoutes } from "./features/households/households.routes.ts";
import { shoppingRoutes } from "./features/shopping/shopping.routes.ts";
import { viewerRoutes } from "./features/viewer/viewer.routes.ts";
import { errorHandler } from "./lib/error-handler.ts";
import type { ApiErrorBody } from "./lib/errors.ts";
import { requestLogger } from "./lib/request-logger.ts";

// Every request body the API accepts is a few hundred bytes of JSON; refuse anything that
// would make the process buffer megabytes before a handler sees it
const MAX_BODY_BYTES = 64 * 1024;

// Each feature owns a path prefix and decides its own auth (see protectedRouter)
export const app = new Hono()
  .basePath("/api")
  .onError(errorHandler)
  .use(requestLogger())
  .use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            error: { code: "PAYLOAD_TOO_LARGE", message: "The request is too large." },
          } satisfies ApiErrorBody,
          413,
        ),
    }),
  )
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .route("/auth", authRoutes)
  .route("/viewer", viewerRoutes)
  .route("/households", householdRoutes)
  .route("/shopping", shoppingRoutes);
