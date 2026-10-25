import { Hono } from "hono";

import * as viewerService from "./viewer.service.ts";

// Public: answers for signed-out visitors too, with nulls instead of a 401
export const viewerRoutes = new Hono().get("/", async (c) => {
  return c.json(await viewerService.getViewer(c.req.raw.headers), 200);
});
