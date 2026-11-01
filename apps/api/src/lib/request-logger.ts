import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { matchedRoutes } from "hono/route";

import { env } from "../config/env.ts";
import { forwardedChain, socketAddress } from "./connection.ts";
import { logger } from "./logger.ts";
import { recordError, startEvent, type WideEvent } from "./wide-event.ts";

// Requests this slow are always kept, whatever the sample rate
const SLOW_REQUEST_MS = 1000;

// Invite codes are join credentials. Query strings aren't logged at all: on /api/auth they carry
// OAuth codes and state.
const SECRETS_IN_PATHS: [RegExp, string][] = [[/(\/invites\/)[^/]+/g, "$1[redacted]"]];

/**
 * Writes one wide event per request when its response is ready: what was asked, by whom, what
 * happened and how long it took, plus whatever the code that handled it added with annotate().
 * Needs the request-id middleware before it.
 */
export const requestLogger = () =>
  createMiddleware<{ Variables: { requestId: string } }>(async (c, next) => {
    const started = performance.now();

    await startEvent(c.get("requestId"), async (event) => {
      try {
        await next();
        complete(event, c, c.res.status, performance.now() - started);
      } catch (err) {
        // Hono's error handler took everything it could; this one escapes as a bare 500
        recordError(err);
        complete(event, c, 500, performance.now() - started);
        throw err;
      }
    });
  });

function complete(event: WideEvent, c: Context, status: number, durationMs: number) {
  const duration_ms = Math.round(durationMs * 10) / 10;
  const path = redactPath(c.req.path);

  const { request_id, error, db, keep, ...context } = event;
  // Request facts first and what the code added after, so the line reads in the same order
  const line: Record<string, unknown> = {
    request_id,
    outcome: status >= 500 ? "server_error" : status >= 400 ? "client_error" : "success",
    http: {
      method: c.req.method,
      route: handlerRoute(c),
      path,
      status_code: status,
      duration_ms,
    },
    client: {
      address: socketAddress(c),
      // The chain Better Auth picks the client from, when behind proxies
      ...(env.TRUSTED_PROXIES.length > 0 && { forwarded_for: forwardedChain(c) }),
      user_agent: c.req.header("user-agent"),
    },
    ...context,
    db,
    error,
  };

  const message = `${c.req.method} ${path} ${status} ${duration_ms}ms`;
  // Load balancers poll this; only worth seeing when debugging
  if (c.req.path === "/api/health") return logger.debug(line, message);

  // Tail sampling: decided after the fact, so every failure and slow request is kept
  const alwaysKeep =
    status >= 400 || error !== undefined || keep === true || durationMs >= SLOW_REQUEST_MS;
  if (!alwaysKeep && Math.random() >= env.LOG_SAMPLE_RATE) return;
  // Each kept success stands for 1/rate requests; queries can weight by this to count them
  if (!alwaysKeep && env.LOG_SAMPLE_RATE < 1) line.sample_rate = env.LOG_SAMPLE_RATE;

  if (status >= 500) logger.error(line, message);
  else if (status >= 400) logger.warn(line, message);
  else logger.info(line, message);
}

/**
 * The pattern of the route that handled the request, e.g. /api/shopping/lists/:listId. After the
 * request, `routeIndex` points at the route that responded. When that was middleware (an auth or
 * origin check answering first), use the route the request was headed for instead.
 */
export function handlerRoute(c: Context): string {
  const routes = matchedRoutes(c);
  const responded = routes[c.req.routeIndex];
  const headedFor = routes
    .slice(c.req.routeIndex + 1)
    .find((route) => route.method !== "ALL" && route.path.startsWith("/api"));
  const route = responded?.method === "ALL" && headedFor ? headedFor : responded;
  return route?.path ?? c.req.path;
}

function redactPath(path: string): string {
  return SECRETS_IN_PATHS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    path,
  );
}
