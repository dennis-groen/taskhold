import { Hono } from "hono";

import { auth } from "../auth.ts";
import { findMembership } from "../households.ts";

// Public: tells the web app who is signed in (if anyone) and which household they're in
export const viewerRoutes = new Hono().get("/viewer", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ user: null, household: null }, 200);
  }

  const { id, name, email, image } = session.user;
  return c.json(
    { user: { id, name, email, image: image ?? null }, household: await findMembership(id) },
    200,
  );
});
