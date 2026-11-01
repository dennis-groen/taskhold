import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { AppError } from "../../lib/errors.ts";
import { requireSameOrigin } from "../../lib/same-origin.ts";
import type { Session } from "./auth.ts";
import { getSession } from "./auth.service.ts";

export type AuthEnv = {
  Variables: {
    user: Session["user"];
    session: Session["session"];
  };
};

/** Rejects requests without a session with 401; otherwise puts the user and session on the context */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await getSession(c.req.raw.headers);
  if (!session) {
    throw new AppError("unauthorized", "UNAUTHORIZED", "Sign in to continue.");
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});

/**
 * A router where every route requires a signed-in user, so `c.get("user")` is always set,
 * and every state-changing request must come from the app's own origin
 */
export const protectedRouter = () => new Hono<AuthEnv>().use(requireSameOrigin).use(requireAuth);
