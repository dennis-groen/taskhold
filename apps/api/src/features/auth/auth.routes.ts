import { Hono } from "hono";

import { withClientIp } from "../../lib/connection.ts";
import { auth } from "./auth.ts";

// Better Auth serves its own endpoints (sign-in, OAuth callbacks, session, sign-out)
export const authRoutes = new Hono().all("/*", (c) => auth.handler(withClientIp(c)));
