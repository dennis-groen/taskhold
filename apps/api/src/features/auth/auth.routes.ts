import { Hono, type Context } from "hono";

import { forwardedChain } from "../../lib/connection.ts";
import { auth } from "./auth.ts";

// Better Auth serves its own endpoints (sign-in, OAuth callbacks, session, sign-out)
export const authRoutes = new Hono().all("/*", (c) => auth.handler(withClientIp(c)));

/**
 * Better Auth reads the client IP (for rate limiting and the session record) from
 * X-Forwarded-For only, so a client could pick its own IP or send none and share one bucket
 * with everyone. Replace it with the chain we can vouch for (see forwardedChain).
 */
function withClientIp(c: Context): Request {
  const chain = forwardedChain(c);
  if (!chain) return c.req.raw;

  const headers = new Headers(c.req.raw.headers);
  headers.set("x-forwarded-for", chain);
  return new Request(c.req.raw, { headers });
}
