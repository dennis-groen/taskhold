import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { auth } from "../auth.ts";

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
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});
