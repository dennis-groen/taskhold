import { serve } from "@hono/node-server";

import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { pool } from "./db/client.ts";

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API running on http://localhost:${info.port}`);
});

// Stop taking requests, let in-flight ones finish, then release database connections
function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  if ("closeIdleConnections" in server) server.closeIdleConnections();
  // Don't hang forever on a request that never ends
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
