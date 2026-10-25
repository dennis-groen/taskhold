import { serve } from "@hono/node-server";

import { app } from "./app.ts";
import { env } from "./env.ts";

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API running on http://localhost:${info.port}`);
});
