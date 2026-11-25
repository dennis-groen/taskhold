import { serve } from "@hono/node-server";

import { env } from "./env.ts";
import { pool } from "./db/db.ts";
import { stopFeed } from "./features/live/live-changes.ts";
import { logger } from "./lib/logger.ts";
import { describeError } from "./lib/wide-event.ts";
import { startDemoCleanup } from "./features/demo/demo.scheduler.ts";
import { startReminders } from "./features/reminders/reminders.scheduler.ts";
import { createServer } from "./server.ts";

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

const server = serve({ fetch: createServer(env.WEB_ROOT).fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, `API running on http://localhost:${info.port}`);
});

const stopReminders = startReminders();
const stopDemoCleanup = startDemoCleanup();

// Stop taking requests, let in-flight ones finish, then release database connections. Live
// streams never finish by themselves, so they're ended first; browsers reconnect to the new server.
function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, `${signal} received, shutting down`);
  stopReminders();
  stopDemoCleanup();
  void stopFeed();
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
