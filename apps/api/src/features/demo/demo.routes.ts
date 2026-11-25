import { Hono } from "hono";

import { withClientIp } from "../../lib/connection.ts";
import { requireSameOrigin } from "../../lib/same-origin.ts";
import { requireAuth } from "../auth/auth.middleware.ts";
import { getSession } from "../auth/auth.service.ts";
import { auth } from "../auth/auth.ts";
import { limitDemoWrites } from "./demo.middleware.ts";
import * as demoService from "./demo.service.ts";

export const demoRoutes = new Hono()
  // Public: starting the demo is how a visitor gets a session
  .post("/", requireSameOrigin, async (c) => {
    const current = await getSession(c.req.raw.headers);
    const { cookies } = await demoService.startDemo(
      withClientIp(c).headers,
      current?.user.id ?? null,
    );
    for (const cookie of cookies) c.header("set-cookie", cookie, { append: true });
    return c.body(null, 204);
  })
  .delete("/", requireSameOrigin, requireAuth, async (c) => {
    await demoService.endDemo(c.get("user").id);
    // The session went with the account; signing out clears its cookies from the browser
    const signedOut = await auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
    for (const cookie of signedOut.headers.getSetCookie()) {
      c.header("set-cookie", cookie, { append: true });
    }
    return c.body(null, 204);
  })
  // Ending a demo is never refused, so it takes nothing from the budget; a housemate's turn does
  .post("/housemate", requireSameOrigin, requireAuth, limitDemoWrites, async (c) => {
    return c.json(await demoService.housemateActs(c.get("user").id), 200);
  });
