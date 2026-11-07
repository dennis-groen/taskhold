import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "./db/db.ts";
import { createServer } from "./server.ts";

// A stand-in for apps/web/dist
let webRoot: string;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  webRoot = await mkdtemp(path.join(tmpdir(), "taskhold-web-"));
  await mkdir(path.join(webRoot, "assets"));
  await writeFile(path.join(webRoot, "index.html"), "<!doctype html><title>taskhold</title>");
  await writeFile(path.join(webRoot, "assets", "index-abc123.js"), "console.log('app')");
  await writeFile(path.join(webRoot, "favicon.svg"), "<svg></svg>");
  server = createServer(webRoot);
});

afterAll(async () => {
  await rm(webRoot, { recursive: true, force: true });
  await pool.end();
});

describe("serving the web app next to the API", () => {
  it("serves index.html for the root and every app route, uncached and unframeable", async () => {
    for (const route of ["/", "/chores", "/lists/123", "/join/ABCD2345"]) {
      const response = await server.request(route);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<title>taskhold</title>");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("caches hashed assets forever, and serves other files as they are", async () => {
    const asset = await server.request("/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await server.request("/favicon.svg")).headers.get("content-type")).toContain("svg");

    // Not the app's HTML, which would then be cached forever under an asset's name
    const missing = await server.request("/assets/index-old999.js");
    expect(missing.status).toBe(404);
    // Nor the 404 itself: a CDN would keep answering 404 for a file that exists once the deploy
    // that adds it has finished
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the API's own responses, and answers unknown API paths with JSON", async () => {
    const viewer = await server.request("/api/viewer");
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );

    const unknown = await server.request("/api/nope");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("doesn't serve files outside the build folder", async () => {
    const response = await server.request("/../package.json");
    expect(await response.text()).not.toContain('"name"');
    const encoded = await server.request("/%2e%2e/%2e%2e/etc/passwd");
    expect(await encoded.text()).not.toContain("root:");
  });
});

describe("request logging behind the web server", () => {
  it("names the API route that handled the request, not the web app's catch-all", async () => {
    const { handlerRoute } = await import("./lib/request-logger.ts");
    const { Hono } = await import("hono");
    const routes: string[] = [];
    // Same composition as production: the API first, then catch-alls, with a probe at the end
    const probe = new Hono()
      .use("*", async (c, next) => {
        await next();
        routes.push(handlerRoute(c));
      })
      .route("/", server);

    await probe.request("/api/viewer");
    // Answered by the sign-in check before reaching its handler
    await probe.request("/api/shopping/lists/abc", { method: "PATCH" });
    await probe.request("/api/auth/get-session");
    await probe.request("/api/nope");
    expect(routes).toEqual(["/api/viewer", "/api/shopping/lists/:listId", "/api/auth/*", "/api/*"]);
  });
});
