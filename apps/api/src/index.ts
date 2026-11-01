import { serve } from "@hono/node-server";

import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { pool } from "./db/client.ts";
import { logger } from "./lib/logger.ts";
import { describeError } from "./lib/wide-event.ts";

// Something escaped every handler, so the process is in an unknown state. Log it the same way as
// request errors, then exit and let the supervisor restart it.
process.on("uncaughtException", (err) => {
  logger.fatal({ error: describeError(err) }, "Uncaught exception, exiting");
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.fatal({ error: describeError(reason) }, "Unhandled promise rejection, exiting");
  process.exit(1);
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, `API running on http://localhost:${info.port}`);
});

// Stop taking requests, let in-flight ones finish, then release database connections
function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, `${signal} received, shutting down`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  if ("closeIdleConnections" in server) server.closeIdleConnections();
  // Don't hang forever on a request that never ends
  setTimeout(() => {
    logger.warn("Requests still running after 10 seconds, exiting anyway");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
