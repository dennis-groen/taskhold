import { createMiddleware } from "hono/factory";

import { auth } from "../auth.ts";
import { ApiError } from "../lib/errors.ts";

type Session = typeof auth.$Infer.Session;

export type AuthEnv = {
  Variables: {
    user: Session["user"];
    session: Session["session"];
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "Sign in to continue.");
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});
