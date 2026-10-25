import { Hono } from "hono";

import { auth } from "./auth.ts";

// Better Auth serves its own endpoints (sign-in, OAuth callbacks, session, sign-out)
export const authRoutes = new Hono().all("/*", (c) => auth.handler(c.req.raw));
