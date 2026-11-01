import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import { app } from "./app.ts";
import type { ApiErrorBody } from "./lib/errors.ts";

/**
 * The whole site: the API under /api and, when `webRoot` is set (in production), the web app's
 * built files for every other path. Serving both from one origin is what the API's same-origin
 * check, the session cookie and the web app's CSP all expect. In development Vite serves the web
 * app instead and proxies /api here.
 */
export function createServer(webRoot: string | undefined) {
  const server = new Hono().route("/", app);
  if (!webRoot) return server;

  return (
    server
      // Unknown API paths stay JSON 404s instead of falling through to the web app
      .all("/api/*", (c) =>
        c.json(
          { error: { code: "NOT_FOUND", message: "There's nothing here." } } satisfies ApiErrorBody,
          404,
        ),
      )
      .use(
        "*",
        secureHeaders({
          // The page's own policy is a <meta> tag from the build; this adds what a tag can't do:
          // stop other sites from framing the app
          contentSecurityPolicy: { frameAncestors: ["'none'"] },
          xFrameOptions: "DENY",
          referrerPolicy: "strict-origin-when-cross-origin",
          // Same as the API: HTTPS for this host only
          strictTransportSecurity: "max-age=15552000",
        }),
      )
      .use("*", async (c, next) => {
        await next();
        c.res.headers.set(
          "Cache-Control",
          // Built assets have content hashes in their names, so they never change. Everything else
          // (index.html above all) is checked on every visit, so people get the current asset names.
          c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
      })
      .get("*", serveStatic({ root: webRoot }))
      // A missing asset (e.g. an old file name after a deploy) is a 404, not the app's HTML
      .get("/assets/*", (c) => c.text("Not found", 404))
      // Every app route (/lists, /chores, ...) is index.html; the router takes it from there
      .get("*", serveStatic({ root: webRoot, path: "index.html" }))
  );
}
