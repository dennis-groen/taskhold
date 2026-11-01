import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";

import { env } from "../../config/env.ts";
import { auth } from "./auth.ts";

// Better Auth serves its own endpoints (sign-in, OAuth callbacks, session, sign-out)
export const authRoutes = new Hono().all("/*", (c) => auth.handler(withClientIp(c)));

/**
 * Better Auth reads the client IP (for rate limiting and the session record) from
 * X-Forwarded-For only, so a client could pick its own IP or send none and share one bucket
 * with everyone. Add the connection's real address: on its own when the API is reached
 * directly, or after the proxy chain when TRUSTED_PROXIES says who may set the header.
 */
function withClientIp(c: Context): Request {
  const peer = socketAddress(c);
  if (!peer) return c.req.raw;

  const headers = new Headers(c.req.raw.headers);
  const forwarded = env.TRUSTED_PROXIES.length > 0 ? headers.get("x-forwarded-for") : null;
  headers.set("x-forwarded-for", forwarded ? `${forwarded}, ${peer}` : peer);
  return new Request(c.req.raw, { headers });
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // Not running on @hono/node-server (e.g. app.fetch in a script): no socket to read
    return undefined;
  }
}
