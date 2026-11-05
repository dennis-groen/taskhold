import { createMiddleware } from "hono/factory";

import { env } from "../env.ts";
import { AppError } from "./errors.ts";

const appOrigin = new URL(env.BETTER_AUTH_URL).origin;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects state-changing requests that a page on another origin made. The session cookie is
 * SameSite=Lax, which stops other sites but not other origins on the same site (a sibling
 * subdomain, or another port on localhost). Browsers send Origin on every non-GET request.
 */
export const requireSameOrigin = createMiddleware(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header("origin") !== appOrigin) {
    throw new AppError(
      "forbidden",
      "CROSS_ORIGIN_REQUEST",
      "This request didn't come from taskhold.",
    );
  }
  await next();
});
