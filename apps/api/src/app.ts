import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { authRoutes } from "./features/auth/auth.routes.ts";
import { choreRoutes } from "./features/chores/chores.routes.ts";
import { householdRoutes } from "./features/households/households.routes.ts";
import { liveRoutes } from "./features/live/live.routes.ts";
import { reminderRoutes } from "./features/reminders/reminders.routes.ts";
import { shoppingRoutes } from "./features/shopping/shopping.routes.ts";
import { todoRoutes } from "./features/todos/todos.routes.ts";
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
  .use(requestId())
  .use(requestLogger())
  // API responses are JSON or redirects, never pages: nothing in them may load or run anything,
  // and they may not be framed. The web app's own policy is in apps/web/content-security-policy.ts.
  .use(
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: "DENY",
      // HTTPS only, for this host. Hono's default adds includeSubDomains, which would also force
      // HTTPS on every other subdomain of the production domain.
      strictTransportSecurity: "max-age=15552000",
    }),
  )
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
  .route("/shopping", shoppingRoutes)
  .route("/chores", choreRoutes)
  .route("/todos", todoRoutes)
  .route("/live", liveRoutes)
  .route("/reminders", reminderRoutes);
