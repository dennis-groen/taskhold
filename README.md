# taskhold

A phone-first, offline-capable PWA for people who share a household: shared shopping lists, repeating chores with push reminders, and private to-dos.

Built as a TypeScript monorepo with a Hono API, Drizzle ORM on PostgreSQL 18, and a Vite + React 19 frontend, deployed as a single self-hostable Docker image.

## What it does

- **Shared shopping lists** — auto-grouped into supermarket aisles, optimistic check-off with undo, "Buy again" suggestions ranked from household purchase history, and live shopping-trip notifications.
- **Repeating chores** — next due date counts from when a chore was done rather than when it was due, with skip/postpone, assignees, completion history, and daily Web Push summaries in each person's time zone.
- **Private to-dos** — visible only to the person who created them, with one-tap promotion into household chores.
- **Households** — 8-character invite codes and shareable join links, automatic ownership transfer on leave, and instant code rotation when a member leaves or is removed.

## Engineering highlights

- **Multi-instance real-time sync:** PostgreSQL `LISTEN/NOTIFY` bridged to Server-Sent Events (`/api/live`). Notifications are sent inside DB transactions so clients never hear about rolled-back writes, and carry only topic names so all data still goes through normal auth checks.
- **Offline-first mutations & idempotency:** Declarative write queue (`defineChange`) persisted to `localStorage` with optimistic UI updates, client-chosen UUIDs so retried creates never duplicate, and versioned schema guards.
- **Concurrency & integrity:** Row-level `FOR UPDATE` locking for household membership transitions, per-identity invite brute-force throttling, and database-claimed daily reminder sends so overlapping runs or multiple instances never double-notify.
- **Defense-in-depth security:** `__Host-` session cookies over HTTPS, same-origin CSRF checks, unused Better Auth endpoints switched off, build-time SHA-256 Content Security Policy Vite plugin, SSRF-hardened Web Push endpoint allowlist with secret-verified device ownership, and trusted-proxy IP chain parsing.
- **Observability & guardrails:** Wide-event canonical JSON logging with Pino (tail-sampled, secret-redacted), end-to-end typed Hono RPC, 169 strict `oxlint` layer rules, `knip` dead-code checks, and cross-package architectural invariant tests (`test/repo-invariants.test.ts`).

## Tech stack

| Layer            | Stack                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| **API**          | Node.js 26 (`Temporal`), TypeScript, Hono, Drizzle ORM, PostgreSQL 18, Zod                                       |
| **Auth & Push**  | Better Auth (Google OAuth), Web Push (VAPID), Pino wide-event logging                                            |
| **Web**          | Vite 8, React 19 (React Compiler), TanStack Router & Query, Tailwind v4, shadcn/Base UI, `vite-plugin-pwa`       |
| **Quality & CI** | Vitest (real Postgres API integration tests + web unit tests), `oxlint`, `oxfmt`, `knip`, GitHub Actions, Docker |

## Structure

```
apps/
  api/   Hono on Node, port 3000, routes under /api
         Better Auth (Google) + Drizzle ORM on Postgres
  web/   Vite + React 19 + React Compiler + TanStack Router, port 5173, proxies /api to the API
```

Both apps are organized in feature slices, with routes, services and repos on the API side. [ARCHITECTURE.md](ARCHITECTURE.md) explains the layers, data flow and lint rules in full; [GLOSSARY.md](GLOSSARY.md) defines the domain terms; [AGENTS.md](AGENTS.md) is the short contributor map.

## Getting started

Requires Node 26+ (for its built-in `Temporal`), pnpm 12 and Docker.

```bash
pnpm install
pnpm db:up        # start Postgres in Docker
cp apps/api/.env.example apps/api/.env
```

Fill in `apps/api/.env`:

- `BETTER_AUTH_SECRET`: generate one with `pnpm --filter @taskhold/api exec auth secret`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: create an OAuth client ID (Web application) in Google Cloud Console under APIs & Services > Credentials, with
  - Authorized JavaScript origin: `http://localhost:5173`
  - Authorized redirect URI: `http://localhost:5173/api/auth/callback/google`

Then apply the migrations and start both apps:

```bash
pnpm db:migrate
pnpm dev          # runs api and web in parallel
```

Open http://localhost:5173.

In VS Code, install the recommended Oxc extension to format and lint on save.

## Demo

With `DEMO_MODE=true`, the sign-in page offers **Try the demo**. `POST /api/demo` signs the visitor in with a throwaway anonymous account (Better Auth's anonymous plugin, whose own `/sign-in/anonymous` route stays switched off) and seeds a household of their own (`features/demo`):

- **"The Flat"**, with two made-up housemates, Noor and Sam, who have no way to sign in. Four lists with Noor out shopping, two months of shopping trips for _Buy again_, ten chores with history (overdue, due today, one-offs), and six private to-dos, all dated from today.
- **Housemate's turn** in the demo banner has Noor tick the oldest item off (or add one), through the shopping service and live updates as a real person's change would arrive.
- **Sealed:** a demo account can't start, join or leave a household, and nobody can join a demo household with its code. _End the demo_ (Household or Account) deletes it at once; otherwise the API deletes demos after 24 hours (`demo.scheduler.ts`, every 10 minutes).
- **Separate:** each demo is its own household with its own housemates, so the usual household scoping keeps demos apart; a test checks that one demo can't see or change another's.
- **Limits**, counted in Postgres so they hold across instances:
  - five demos running at once per client IP (an IPv6 address by its /64), checked before anything is written (`TOO_MANY_DEMOS`, 429);
  - 500 demo households at once (`DEMO_FULL`, 503);
  - 1,000 changes per demo (`DEMO_BUDGET_SPENT`, 429), on top of the usual caps. Every change writes at most a couple of rows and no endpoint takes a batch, so one demo stays at a few thousand rows however it's driven. Reading and ending a demo aren't counted.

## Auth

- Every page requires a signed-in user except the ones in `PUBLIC_PATHS` in `apps/web/src/features/auth/page-access.ts` (only `/` for now).
- API routers built with `protectedRouter()` (`apps/api/src/features/auth/auth.middleware.ts`) require a session on every route and return 401 otherwise. They also reject state-changing requests whose `Origin` isn't the app's own (403), because the SameSite=Lax session cookie doesn't stop other origins on the same site.
- Better Auth endpoints the app doesn't use (`update-user`, `get-access-token`, password and email routes, and others) are switched off in `UNUSED_ENDPOINTS` in `auth.ts`. Re-enable one there when a feature needs it.
- Better Auth rate-limits `/api/auth/*` in every environment (except `NODE_ENV=test`), keyed by client IP. `auth.routes.ts` sets that IP from the connection, so clients can't pick their own with `X-Forwarded-For`. Behind a reverse proxy, list its addresses in `TRUSTED_PROXIES` so the client is read from the forwarded chain instead.
- Sessions are stored in Postgres through Drizzle. The auth tables live in `apps/api/src/features/auth/auth.table.ts`, generated by the Better Auth CLI.
- "Sign out of other devices" on `/household` ends every other session of the person, for when a phone is lost (`DELETE /api/viewer/other-sessions`). A device that was signed out is refused at its next request; its saved offline copy is dropped at its next successful "who's signed in" check, and a live stream it has open ends within 15 minutes.

## Reminders

- Each person can get one push notification a day with what is due today or overdue: their chores (the ones assigned to them and the ones assigned to nobody) and their own to-dos, which count with or without a household. With only chores due it reads "2 chores today, 1 overdue"; once a to-do is in it, everything is counted together ("3 due today, 1 overdue"). The names are listed with overdue first and chores before to-dos. Nothing is sent on a day with nothing due.
- They turn it on per device under "Reminders" on `/household` (`features/reminders` in both apps). The time is per person (08:00 at first) in the time zone of the device they last turned it on from, and "Send a test" checks that notifications come through. On iPhone and iPad, Safari only allows notifications in the app added to the Home Screen, and the page says so.
- The API checks once a minute (`reminders.scheduler.ts`) whose time has come in their own time zone. Each person's day is claimed in the database before sending, so a slow run or a second API instance can't send it twice. After downtime, people whose time passed meanwhile get theirs on the next run.
- Messages go through the browser vendors' push services with Web Push (`web-push`, `apps/api/src/lib/push.ts`), encrypted so only the device can read the names. The server only sends to the known push services (Google, Mozilla, Microsoft, Apple), so a made-up subscription can't make it call another host. Devices the push service says are gone are deleted.
- Signing out or deleting the account unsubscribes the browser, so the next person on that device doesn't get someone else's reminders. The service worker shows the notifications and opens the page named in the message when one is tapped (`/chores`, or `/personal` when only to-dos are in it) (`apps/web/public/push-handler.js`).
- **Setup:** generate a key pair once and set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (in `apps/api/.env`, and in your production environment):

  ```bash
  pnpm --filter @taskhold/api exec web-push generate-vapid-keys
  ```

  Without them, the reminders section stays hidden. Changing the keys later makes every device resubscribe the next time it opens the Household page. `VAPID_SUBJECT` (optional) is the contact push services see; it defaults to `BETTER_AUTH_URL`.

- Push needs the service worker, which only exists in production builds (see "Installing the app").
- Tables: `push_subscription` and `reminder_setting` in `apps/api/src/features/reminders/reminders.table.ts`. Both go when the account is deleted.

## Live updates

- When someone changes something, everyone else in the household sees it within a moment, without polling. Each open app keeps a server-sent events stream open (`GET /api/live`, `features/live`).
- Services call `announce()` (`apps/api/src/features/live/live-changes.ts`) after a change, which runs Postgres `NOTIFY`. Inside a transaction Postgres sends it only when the transaction commits, so nobody refetches before a change is visible or hears about one that was rolled back. Every API instance `LISTEN`s on one extra database connection, so this works with more than one instance too.
- A message is only a topic (`shopping`, `chores`, `todos`, `household`), never data: the app refetches through the normal endpoints, which check who may see what. Household changes go to the household's members; to-do changes go only to the person's own devices.
- Each stream follows the person: joining or leaving a household switches what it hears about, and deleting the account closes it. Streams end after 15 minutes and the browser reconnects, so the session is checked again. Each account can keep up to 10 streams open at once; extra connections get 429 and the app falls back to polling until a slot frees up. A comment every 25 seconds keeps proxies (Cloudflare closes idle connections after 100 seconds) from cutting the connection.
- In the app, `lib/live-updates.ts` holds the connection and `routes/_household.tsx` decides what to refetch. Changes to the person's own pending edits wait for the edit to finish, so the screen doesn't jump back. After a reconnect, or if the database connection behind the feed dropped, it refetches everything. While the stream is down, open lists poll every 5 seconds and the chores page every 10 seconds, as before. Losing the stream only restarts that polling; it never reloads who's signed in, because it usually means the connection itself is gone (a phone waking up from its pocket), and that reload would fail and show the error screen.
- On shutdown the API ends all streams first, so deploys aren't held up; apps reconnect to the new instance.
- Changes made without a connection (making, renaming and deleting lists, ticking or adding items, adding, editing, deleting and clearing chores, marking chores done or putting them off, editing to-dos and moving them to chores) show straight away, wait, and are sent when the connection is back; an "Offline · N changes waiting" pill says so (`components/ConnectionStatus.tsx`). They also survive closing the app: `lib/offline-cache.ts` keeps the person's lists, chores and to-dos and their waiting changes in `localStorage`, and restores them after the next successful "who's signed in" check, then sends the changes. It saves half a second after a change, and at once when the app is hidden or closed. Changes that are safe to send twice (ticks, adds and new lists with the app's own ids, edits, deleting chores and lists) are also kept while their request is on its way; other deletes, moving a to-do and chore undos only while they're waiting. To make that work, each change is declared with `defineChange` (`lib/offline-changes.ts`, used by `features/*/*.changes.ts` and registered in `router.tsx`), and everything a change needs travels in its variables. The saved copy is tied to the person it belongs to: signing out, deleting the account, or someone else signing in on the device drops it, and it expires after 7 days without use. With it go who is signed in and the household's member names (never the invite code), so the app also opens with no connection at all: when the "who's signed in" check can't reach the API, the shopping, chores and personal pages open from the copy, as the person it was saved for, and ticks and adds wait as usual. The household and invite pages say they need a connection. The check runs again once the connection is back (and when the app is reopened, or every 30 seconds while the browser says it's online); if the person was signed out meanwhile, the copy and its waiting changes are dropped and the sign-in page shows. Without a copy (signed out, or nothing saved yet) it's the "Can't reach taskhold" screen as before. Reminder settings aren't saved.

## Deleting an account

- "Delete account" is on `/household`, and at the bottom of `/onboarding` for people without a household. It asks for confirmation, spelling out what happens to their household.
- `DELETE /api/viewer` deletes the account in one transaction. The person first leaves their household the usual way (the earliest member becomes owner, or the household is deleted if they were the last one), then the `user` row is deleted.
- Foreign keys decide the rest: sessions, Google sign-in accounts, private to-dos and invite attempts are deleted; shopping items they added or checked, chores assigned to them and chores they completed stay in the household with the person set to null.
- The response clears the session cookie. The app uses its own endpoint, not Better Auth's `delete-user` (still switched off), because Better Auth knows nothing about households.

## Layout

Signed-in pages that need a household share one frame (`components/layout/HouseholdShell.tsx`): a left sidebar on wide screens and a frosted bottom dock on phones with the area's add control stacked over the Shopping, Chores, To-dos and Household tabs. Overview pages open with a coloured `AreaHeader` slab (`components/layout/AreaHeader.tsx`) over hairline-divided groups (`components/layout/Group.tsx`). `/dashboard` redirects to `/lists`. Onboarding keeps the simpler `AppShell`.

## Households and onboarding

- A signed-in user without a household is sent to `/onboarding`, where they create a household or join one with an 8-character invite code. A user belongs to at most one household.
- `/invite` shows the household's code and a shareable link (`/join/ABCD-EFGH`). Opening the link while signed out goes through sign-in and comes back to it.
- The owner can remove members (on `/household`) and replace the invite code (on `/invite`); the old code and link stop working immediately. Removing a member replaces the code too, because every member can see it and the removed one would otherwise know how to rejoin.
- Anyone can leave. If the owner leaves, the member who joined earliest becomes the owner. If the last member leaves, the household is deleted.
- Every change to who is in a household locks the household row in a transaction, so simultaneous joins, leaves and removals can't leave a household without members or without an owner.
- Each account can try 10 invite codes that match nothing per 15 minutes; after that, preview and accept return 429. Misses are stored in `invite_code_attempt`, so the limit holds across restarts and API instances.
- Tables: `household`, `household_member` and `invite_code_attempt` in `apps/api/src/features/households/households.table.ts`.

## Shopping lists

- Every member of a household can create, open, change and delete all of its lists. Lists are on `/lists` (the Shopping tab), and each one opens at `/lists/:listId`.
- Items have a name and an optional free-text quantity ("2", "500 g"). Checking one off records who did it; "Clear checked off" removes everything that's been bought.
- The add field in the dock (over the bottom bar on phones, at the foot of the page on wide screens) adds straight to the open list — or creates and opens a new list on the Shopping overview — and opens the add sheet on Chores and To-dos.
- Items are grouped into category cards in supermarket order (Produce, Bakery, Meat & Fish, Dairy & Eggs, Pantry, Frozen, Snacks & Sweets, Drinks, Household, Personal care), with anything unrecognised under Other. Within a category open items are A to Z (ignoring case, numbers by value) and ticked items sink to the bottom latest first; once every item in a category is ticked and settled, the card folds to its header until tapped. The category comes from the item's name, matched against an English word list (`features/shopping/grocery-words.ts`, matching in `categories.ts`): whole words, plurals included, the most specific phrase winning ("coconut milk" is Pantry, not Dairy). Nothing is stored, so it works offline and applies to existing items. A list with nothing recognised shows one headerless card. To fix a wrong category, add a more specific phrase to the word list.
- Ticked items move to "In cart"; "Done shopping" clears them. Items you tick stay in place, crossed out, until you stop tapping for 2.5 seconds, then fold away into the cart together (`lib/use-settling-items.ts`; no animation with the system's reduce-motion setting). A wrong tick can be undone with another tap where it is, and rows don't shift under your next tap. Others see the tick straight away. Removing an item or clearing the cart shows a toast with Undo, which puts the items back with the same ids, quantities and ticks.
- Changes show straight away (optimistic updates with React Query) and roll back with a toast if the API rejects them.
- Changes from other members show up straight away through live updates (see below). If someone deletes the list, the page says so.
- Items can carry a client-generated id, so a retried add doesn't create a duplicate. So can lists (`POST /api/shopping/lists` takes an optional uuid `id`): the app opens a new list before the API has it, offline too. A retry answers with the list as it is; an id another household uses answers 409 `LIST_ID_TAKEN`. Deleting a list that's already gone, or isn't the household's, answers 204 and does nothing.
- Tables: `shopping_list` and `shopping_item` in `apps/api/src/features/shopping/shopping.table.ts`. Deleting a household deletes its lists; when someone leaves, the items they added stay.
- "Rename list" at the bottom of a list opens a sheet to change its name (`PATCH /api/shopping/lists/:listId`). Other members see the new name straight away through live updates.
- **Buy again.** Ticking an item off records it as bought, for the whole household (`shopping_purchase`); unticking takes that back, and renaming a ticked item renames its record. The record outlives the item, so "Done shopping" doesn't erase it. `GET /api/shopping/history` returns the last year, one entry per name (ignoring case, spelled as last bought) with how many days it was bought on and when first and last.
  - The app ranks it (`features/shopping/buy-again.ts`), so it works offline and follows what's typed. With nothing typed it offers regulars (bought on two days or more) that are due: something bought every 4 days and last bought 5 days ago comes first, and something bought a few days into a two-week rhythm isn't offered. While typing it offers anything bought whose name has a word starting with what's typed, accents and case aside. What's already waiting on the list is left out.
  - Quick chips appear in the dock above the add field while focused or typing on a list, and in the Buy again section on the Shopping overview; tapping one toggles it on or off the list without closing the keyboard. Both places also open the full Buy again restock sheet (`BuyAgainSheet.tsx`) to search, browse, bulk-add or forget past buys.
  - Records hold only the household and the name, never who bought it. They go with the household; anything older than a year is no longer offered.

## Chores

- Chores are on `/chores` (the Chores tab). Every member can add, change, delete and do any chore.
- A chore is one-off or repeats every N days or weeks. A repeating chore always has a next due date; a one-off one may have none ("Anytime").
- **The next due date counts from when it was done, not from when it was due.** A weekly chore done two days late is next due a week after it was done, so a household that falls behind doesn't come back to a pile of overdue chores.
- A chore can be assigned to one member, or to nobody ("Anyone"). Anyone can still do it, and the history records who did. When an assignee leaves the household, the chore shows as unassigned.
- Due dates are plain dates (`YYYY-MM-DD`), with no time or timezone. "Today" and "overdue" follow the clock on each person's device, and the device sends its date when marking a chore done. The API accepts only a date within a day of the UTC date, which covers every timezone.
- The page groups chores into Overdue, Today, This week, Later and Anytime, with filters for All, Mine and Anyone.
- Ticking a chore shows a toast with Undo for a few seconds. Later, the most recent completion can still be undone from the chore's sheet, which puts its due date back. Older history can't be changed.
- Doing a chore again on the same day changes nothing, so a double tap or two people at once count once.
- Done one-off chores collapse into "Done"; "Clear done" removes them.
- The app may choose a new chore's id (`POST /api/chores` takes an optional `id`), so an add that is sent twice makes one chore, and deleting a chore that is already gone answers 204 like to-dos do.
- Changes from other members show up straight away through live updates (see below).
- Tables: `chore` and `chore_completion` in `apps/api/src/features/chores/chores.table.ts`. A check constraint keeps repeat settings consistent and makes repeating chores have a due date. Deleting a household or a chore deletes its history.

## Private to-dos

- To-dos are on `/personal` (the Personal tab). They belong to a person, not a household: only they can see or change them, and other members of the household get a 404 for every one. They stay with the person when they leave or switch households.
- A to-do has a name, an optional due date and optional notes. It doesn't repeat; repeating household work belongs in Chores.
- The page groups to-dos like chores (Overdue, Today, This week, Later, Anytime). Done ones collapse into "Done", and "Clear done" removes them. Deleting a to-do or clearing done ones shows a toast with Undo, which brings them back with their notes and due dates.
- Adding, ticking off and removing show straight away (optimistic updates), and to-dos can carry a client-generated id so a retried add doesn't duplicate. Changes made on the person's other devices arrive through live updates; nobody else hears about them.
- "Move to household chores" turns a to-do into a one-off chore with the same name and due date, assigned to nobody, and deletes the to-do. Notes aren't shared: they're deleted with it. It leaves the to-dos straight away and waits for a connection like other changes; moving without a household fails and brings the to-do back with a notice.
- Wide events log only to-do ids and counts, never names or notes.
- Table: `todo` in `apps/api/src/features/todos/todos.table.ts`. Deleting an account deletes its to-dos.

## Light and dark mode

- The app follows the device's light or dark setting, and switches live when that setting changes.
- Under Household > Appearance (`components/ThemeToggle.tsx`), people can pick Light, Dark, or Auto (follow the device). Light and Dark are saved in `localStorage` (`taskhold-theme`), per device, and picking Auto clears the stored choice so the device setting leads again.
- A small inline script in `apps/web/index.html` applies the theme before the first paint, so dark mode doesn't flash white. `components/ThemeProvider.tsx` follows the same rule after that. The Content Security Policy allows it by its hash, which the build computes (see "Security headers").
- Each area has its own light and dark palette in `apps/web/src/styles/globals.css` (see `apps/web/DESIGN.md`): in dark mode, header slabs soften their chroma while text, ticks and active tab pills brighten for contrast.

## Installing the app (PWA)

- taskhold can be installed from the browser ("Install app" in Chrome and Edge, "Add to Home Screen" on iPhone and Android). The manifest is `apps/web/public/manifest.webmanifest`; the icons are next to it.
- `vite-plugin-pwa` generates a service worker (`sw.js`) at build time. It keeps the app itself (HTML, JS, CSS, fonts, icons) on the device, so the installed app opens without a connection. API responses are never cached: they're private and live. Navigations under `/api` (such as the Google sign-in callback) always go to the server.
- When the API can't be reached, the app shows "Can't reach taskhold" (`components/RootError.tsx`) instead of the sign-in page. It retries a few times over about 3 seconds before showing it, since a phone opening the installed app can take a moment to reconnect. The screen then keeps trying again by itself: when the device is back online, when the app is opened again, and every 10 seconds.
- After a deploy, open apps download the new version in the background (they check every hour too) and show a "A new version of taskhold is ready" toast (`components/UpdatePrompt.tsx`). Nothing switches until the person taps Reload.
- The service worker only exists in production builds. To try it locally, run `pnpm --filter @taskhold/web build` and `pnpm --filter @taskhold/web preview` (with the API running).
- `index.html` sets `viewport-fit=cover`, so the `env(safe-area-inset-*)` padding works on phones with a notch or home indicator.

## Security headers

- **Web app:** `apps/web/content-security-policy.ts` is a Vite plugin that adds a Content Security Policy to the built `index.html` as a `<meta>` tag.
  - **Scripts:** only the app's own files run, plus inline scripts allowed by their SHA-256 hash, today just the theme script. The build hashes every inline script in the final HTML, so editing the theme script can't break the policy.
  - **Images:** only from the app itself, `data:` URLs and Google's profile-picture host (`*.googleusercontent.com`).
  - **Everything else:** data requests go only to the app's own origin, and plugins and `<base>` tags are blocked.
  - **Development:** the dev server has no policy, because Vite's hot reloading uses inline scripts. Use `pnpm --filter @taskhold/web exec vite preview` to try the production build with the policy; it proxies `/api` to port 3000 like the dev server.
- **Not covered by a `<meta>` tag:** it can't stop other sites from framing the app (`frame-ancestors`). The production server sends that as a header instead (see "Deploying").
- **API responses** get Hono's `secureHeaders`: a policy of `default-src 'none'; frame-ancestors 'none'` (they're JSON or redirects, never pages), plus `X-Frame-Options: DENY`, `nosniff` and the usual set. HSTS applies to the app's host only (no `includeSubDomains`), so it doesn't affect other subdomains of the production domain.

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

## API client (Hono RPC)

The web app calls the API through a typed [Hono RPC](https://hono.dev/docs/guides/rpc) client, exported from `apps/api/src/rpc-client.ts` as `@taskhold/api/client`. Each web feature wraps its calls in a `<feature>.api.ts` file, with request and response types coming straight from the API routes:

```ts
// apps/web/src/features/households/households.api.ts
export async function createHousehold(name: string): Promise<Household> {
  return (await parseResponse(households.$post({ json: { name } }))).household;
}
```

`apps/web` references the API's build tsconfig (`apps/api/tsconfig.build.json`), so `tsc -b` builds the API's type declarations first and the editor never re-infers the whole API. Errors come back as `{ error: { code, message } }`; `errorMessage()` in `apps/web/src/lib/api.ts` reads the message.

## Database

After changing Better Auth plugins or config, regenerate its schema with `pnpm auth:generate`. After any schema change, create and apply a migration:

```bash
pnpm db:generate
pnpm db:migrate
```

## Tests

`pnpm test` runs both apps' tests with [Vitest](https://vitest.dev); `pnpm test <feature>` (e.g. `pnpm test chores`) runs one feature's tests. In one app, `pnpm test:watch` reruns them on every change. Tests sit next to the code they cover (`*.test.ts`).

- **API** (`apps/api/src/**/*.test.ts`, shared setup in `apps/api/test/`): integration tests that call the Hono app in-process through its typed client, so no server has to run.
  - They use their own database, `taskhold_test`, in the same Docker Postgres. It's created and migrated automatically, and emptied at the start of each run, so dev data is never touched. Set `TEST_DATABASE_URL` to use another database, e.g. in CI. Its name must end in `_test`: the tests refuse to run otherwise, because they empty every table.
  - Test users get a real Better Auth session, so every request goes through the same sign-in and same-origin checks as in the app.
  - The tests cover who can see and change what: other households and other people get 404s, the owner-only actions, and the invite-guess limit. They also cover the chore due-date and undo rules, retries with client-chosen ids, and moving a to-do to chores.
- **Web** (`apps/web/src/**/*.test.ts`): unit tests for the date helpers, offline changes and the copy kept on the device (`lib/`), each feature's changes (`features/*/*.changes.test.ts`), and shopping's quick-add parsing, categories, sorting and buy-again ranking. The date helpers run twice, on native Temporal and on `temporal-polyfill`, because browsers without Temporal use the polyfill.
- Vitest is installed once, at the workspace root.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`, in two jobs side by side:

- **Format, lint, typecheck, build:** `pnpm check`, then `pnpm build`, then `pnpm db:generate` must produce no new files in `apps/api/drizzle`, so a `*.table.ts` change can't reach production without its migration.
- **Tests:** `pnpm test` against a Postgres 18 service container, with `TEST_DATABASE_URL` pointing at `taskhold_test`.

On a push to `main`, a third job deploys once both pass (see "Deploying"), so a red build never reaches production. Actions are pinned to commit SHAs, with the tag in a comment; update both together.

## Scripts

| Command               | What it does                                      |
| --------------------- | ------------------------------------------------- |
| `pnpm dev`            | Start both apps in watch mode                     |
| `pnpm dev:api`        | Start only the API                                |
| `pnpm dev:web`        | Start only the frontend                           |
| `pnpm build`          | Build all apps                                    |
| `pnpm typecheck`      | Typecheck all apps, tests included                |
| `pnpm test`           | Run all tests (needs Postgres: `pnpm db:up`)      |
| `pnpm test:web`       | Run only web tests (fast, no Postgres needed)     |
| `pnpm test:api`       | Run only API tests (needs Postgres: `pnpm db:up`) |
| `pnpm test <feature>` | Run one feature's tests, e.g. `pnpm test chores`  |
| `pnpm lint`           | Lint everything with oxlint                       |
| `pnpm format`         | Format everything with oxfmt                      |
| `pnpm check`          | Format check, lint, typecheck                     |
| `pnpm db:up`          | Start Postgres (Docker) and wait until healthy    |
| `pnpm db:down`        | Stop Postgres (data is kept in a Docker volume)   |
| `pnpm db:generate`    | Generate a migration from the Drizzle schema      |
| `pnpm db:migrate`     | Apply pending migrations                          |
| `pnpm db:studio`      | Open Drizzle Studio                               |
| `pnpm auth:generate`  | Regenerate the Better Auth Drizzle schema         |
