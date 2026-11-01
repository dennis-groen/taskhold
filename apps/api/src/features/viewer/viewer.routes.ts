import { Hono } from "hono";

import { requireSameOrigin } from "../../lib/same-origin.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { auth } from "../auth/auth.ts";
import * as viewerService from "./viewer.service.ts";

export const viewerRoutes = new Hono()
  // Public: answers for signed-out visitors too, with nulls instead of a 401
  .get("/", async (c) => {
    return c.json(await viewerService.getViewer(c.req.raw.headers), 200);
  })
  .delete("/", requireSameOrigin, requireAuth, async (c) => {
    await viewerService.deleteAccount(c.get("user").id);
    // The session went with the account; signing out clears its cookies from the browser
    const signedOut = await auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
    for (const cookie of signedOut.headers.getSetCookie()) {
      c.header("set-cookie", cookie, { append: true });
    }
    return c.body(null, 204);
  });
