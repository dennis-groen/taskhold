# Running taskhold

Deploying the Docker image, and what the server does about security headers, limits and logging. [features.md](features.md) describes the app itself.

## Deploying

The root `Dockerfile` builds one image for the whole app. The API serves the web app's build next to `/api` (`apps/api/src/server.ts`), so both share one origin, which the same-origin check, the session cookie and the CSP rely on.

- **On start**, the container applies pending migrations (`dist/db/migrate.js`), then starts the API on port 3000 with `NODE_ENV=production`. It runs as the unprivileged `node` user, and its health check calls `/api/health`.
- **Caching:** files under `/assets/` have content hashes in their names and are cached for a year; everything else, including `index.html`, is revalidated on every visit. Every app route returns `index.html`, a missing asset is a 404, and unknown `/api/*` paths get a JSON 404.
- **Page headers:** the pages are sent with `frame-ancestors 'none'` and `X-Frame-Options: DENY`, which the `<meta>` policy can't set.
- **Environment:** the image needs the same variables as `apps/api/.env.example`:
  - `DATABASE_URL`;
  - `BETTER_AUTH_URL`, the public `https://` origin;
  - `BETTER_AUTH_SECRET`;
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`;
  - `TRUSTED_PROXIES`, the reverse proxy's addresses;
  - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` for chore reminders (optional: without them reminders are off).

  `.dockerignore` keeps `.env` files out of the image.

- **Google:** in Google Cloud Console, add `https://<domain>/api/auth/callback/google` as an authorized redirect URI and `https://<domain>` as a JavaScript origin.

To try the image locally:

```bash
docker build -t taskhold .
```

**Self-hosting with Coolify (or any Docker host behind a reverse proxy):**

- **Application:** build from `main` with the root `Dockerfile` on port `3000`, with a health check against `GET /api/health`. (`compose.yaml` is only for the local dev database.)
- **CI-gated deploys:** `.github/workflows/ci.yml` includes a `deploy` job that runs after checks, tests, and the Docker build pass on `main` (skipping stale commits if `main` has moved on). It triggers a Coolify deploy webhook and polls until the deployment finishes, using two repository secrets (`COOLIFY_WEBHOOK` and `COOLIFY_TOKEN`).
- **Database:** PostgreSQL 18 on an internal/private network, pointed to by `DATABASE_URL`.
- **Domains:** serve from the single `https://<your-domain>` origin configured in `BETTER_AUTH_URL` (redirect `www` to it and remove any temporary platform hostnames). Requests on any other host fail the same-origin check with 403 and break OAuth callbacks.
- **Variables:** set environment variables as runtime-only (the Docker build does not need them).
- **Reverse proxies & client IPs:** if requests pass through a CDN (e.g. Cloudflare) and an internal reverse proxy (e.g. Traefik), list your proxy network CIDR(s) and CDN IP ranges in `TRUSTED_PROXIES`:
  - Traefik replaces `X-Forwarded-For` with the edge server it saw, so `apps/api/src/lib/connection.ts` puts Cloudflare's `CF-Connecting-IP` ahead of the forwarded chain when `TRUSTED_PROXIES` is set.
  - A forged `CF-Connecting-IP` sent directly to the server is ignored: the proxy records the sender's real IP as the hop, which isn't trusted, so IP extraction stops there.

## Production settings

- `pnpm --filter @taskhold/api start` runs with `NODE_ENV=production`, set in the script itself, so `.env` can't override it. The Docker image sets it too.
- **Database timeouts** (`apps/api/src/db/db.ts`):
  - waiting for a connection gives up after 5 seconds;
  - Postgres cancels any statement after 10 seconds, including one waiting on a row lock;
  - Postgres ends a session that sits in an open transaction for 10 seconds.

  Every query the app runs takes milliseconds, so these only stop something stuck from holding one of the pool's 10 connections forever.

## Request limits

Request bodies over 64 KB get 413 before any handler reads them (`bodyLimit` in `apps/api/src/app.ts`).

## Security headers

- **Web app:** `apps/web/content-security-policy.ts` is a Vite plugin that adds a Content Security Policy to the built `index.html` as a `<meta>` tag.
  - **Scripts:** only the app's own files run, plus inline scripts allowed by their SHA-256 hash, today just the theme script. The build hashes every inline script in the final HTML, so editing the theme script can't break the policy.
  - **Images:** only from the app itself, `data:` URLs and Google's profile-picture host (`*.googleusercontent.com`).
  - **Everything else:** data requests go only to the app's own origin, and plugins and `<base>` tags are blocked.
  - **Development:** the dev server has no policy, because Vite's hot reloading uses inline scripts. Use `pnpm --filter @taskhold/web exec vite preview` to try the production build with the policy; it proxies `/api` to port 3000 like the dev server.
- **Not covered by a `<meta>` tag:** it can't stop other sites from framing the app (`frame-ancestors`). The production server sends that as a header instead (see [Deploying](#deploying)).
- **API responses** get Hono's `secureHeaders`: a policy of `default-src 'none'; frame-ancestors 'none'` (they're JSON or redirects, never pages), plus `X-Frame-Options: DENY`, `nosniff` and the usual set. HSTS applies to the app's host only (no `includeSubDomains`), so it doesn't affect other subdomains of the production domain.

## Logging

The API logs with [pino](https://getpino.io) and writes **one wide event per request** (a "canonical log line"). Each event is a single line that holds everything known about the request once its response is ready, so one query answers questions that would otherwise mean joining many lines:

```json
{
  "level": "warn",
  "time": "2026-11-01T13:10:54.376Z",
  "service": "taskhold-api",
  "request_id": "fc724202-…",
  "outcome": "client_error",
  "http": {
    "method": "GET",
    "route": "/api/households/invites/:code",
    "path": "/api/households/invites/[redacted]",
    "status_code": 404,
    "duration_ms": 8.4
  },
  "client": { "address": "::1", "user_agent": "…" },
  "user": { "id": "…" },
  "invite": { "recent_failed_attempts": 0, "matched": false },
  "db": { "queries": 7 },
  "error": { "type": "AppError", "kind": "not_found", "code": "INVITE_NOT_FOUND", "message": "…" },
  "msg": "GET /api/households/invites/[redacted] 404 8.4ms"
}
```

- **How an event is built:** `lib/request-logger.ts` starts an event for each request and writes it when the response is ready. Code anywhere in the request adds fields with `annotate(group, fields)` from `lib/wide-event.ts`; services add the user, household, invite and shopping details. The error handler records the error, and Better Auth's own messages go into `auth.logs`.
- **Levels:** 5xx is `error`, 4xx is `warn`, everything else `info`. `/api/health` is logged at `debug`.
- **Request ids:** every response has an `X-Request-Id` header. An incoming `X-Request-Id` (from a proxy, say) is reused. Lines written during a request with `logger` directly also carry its `request_id`.
- **Sampling:** with `LOG_SAMPLE_RATE` below 1, only that share of fast, successful requests is kept. Errors, slow requests (over 1 s) and requests where Better Auth warned are always kept. Kept sampled events carry `sample_rate`, so counts can be weighted back up.
- **What is never logged:**
  - query strings (on `/api/auth` they carry OAuth codes and state);
  - invite codes in paths (shown as `[redacted]`);
  - request and response bodies, headers other than the user agent, and SQL parameters;
  - Postgres `detail` messages, which quote the conflicting values.
- **Outside requests:** startup, shutdown, a failing idle database connection, and uncaught exceptions are logged on lines of their own. Uncaught exceptions and unhandled rejections are logged as `fatal` and exit the process, so a supervisor can restart it.

| Variable          | Default                                   |                                                                |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------- |
| `LOG_LEVEL`       | `info`                                    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `LOG_FORMAT`      | `pretty` in development, `json` otherwise | JSON for log collectors, pretty for a terminal                 |
| `LOG_SAMPLE_RATE` | `1`                                       | Share of fast, successful requests to keep                     |
