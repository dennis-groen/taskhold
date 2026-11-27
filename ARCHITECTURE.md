# Architecture

Both apps are organized by feature (vertical slices). A feature folder holds everything for one area of the product, so adding or changing a feature mostly touches one folder. Lint rules keep the layers from reaching into each other.

## API (`apps/api/src`)

```
index.ts                  starts the HTTP server, shuts down cleanly on SIGTERM/SIGINT
server.ts                 the API plus, in production (WEB_ROOT), the web app's build on one origin
app.ts                    composes the API: middleware, error handler, one router per feature
rpc-client.ts             typed RPC client for the web app (@taskhold/api/client)
env.ts                    environment, validated with zod at startup
db/                       Postgres pool and transaction() (db.ts), column types, migrations at start,
                          schema.ts (re-exports every feature's *.table.ts)
lib/                      infrastructure that knows no feature: AppError, error handler, validate(), logger,
                          wide events, the push sender
features/<name>/          one folder per feature; AGENTS.md lists them. For example:
  households/
    households.routes.ts      HTTP: routes, input validation, status codes
    households.service.ts     business rules: who may create, join, see what
    households.repo.ts        data access: the only file that queries household tables
    households.table.ts       Drizzle tables
    households.schema.ts      the contract: zod schemas for request input and the shapes returned to clients
    households.errors.ts      the feature's AppErrors
    households.test.ts        integration tests for the feature's routes
    invite-code.ts            domain logic that isn't a role, named for what it does
```

Files worth knowing that their names don't give away:

- `features/auth/auth.ts` is the Better Auth instance; `auth.middleware.ts` has `requireAuth` and `protectedRouter()`.
- `features/live/live-changes.ts` has `announce()`, which services call after a write (chores and shopping through `householdWrites` instead, which lint enforces), and the Postgres LISTEN/NOTIFY feed behind `/api/live`. `live-topics.ts` lists what a live update can be about.
- `features/reminders/reminders.scheduler.ts` sends due reminders through `lib/push.ts`.

### Layers

Requests flow `routes → service → repo → database`, never backwards.

| Layer          | Does                                                                                     | Doesn't                                     |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `*.routes.ts`  | Validates input with `validate()`, reads the user, picks status codes                    | Touch the database or decide business rules |
| `*.service.ts` | Enforces business rules, groups repo calls with `transaction()`, throws `AppError`       | Build queries or know about HTTP            |
| `*.repo.ts`    | Runs Drizzle queries, returns plain records, takes an optional executor for transactions | Call services or decide what's allowed      |

- Services throw `AppError(kind, code, message)`. `lib/error-handler.ts` maps the `kind` to a status code and responds with `{ error: { code, message } }`.
- Every request is logged as one wide event (`lib/request-logger.ts`). Services add what they know about the request with `annotate(group, fields)` from `lib/wide-event.ts`, using ids and counts, never names, codes or other user content. Don't log separate lines during a request: add to its event instead.
- A rule the web app needs too (what marking a chore done or skipping it does to its due date) lives once in the API and is exported for the web app in `package.json`, like the RPC client: `features/chores/chore-schedule.ts` is `@taskhold/api/chore-schedule`. The web app bundles that file, so it may import types only (lint enforces it), and it stays free of HTTP and the database: the service applies its answers inside its transaction. The invite code's alphabet and length (`@taskhold/api/invite-code`) and the live topics (`@taskhold/api/live-topics`) are shared the same way.
- A feature may call another feature's service, never its repo or routes. Services also call `announce()` from `live/live-changes.ts`. `viewer` uses `auth` and `households` this way, `chores` and `shopping` write through `householdsService.householdWrites()`, which runs the write for a member only, in one transaction that holds the household so nobody leaves meanwhile, and announces it on commit. Reads ask `householdsService.getMembershipOf()`. `todos` moves a to-do to chores inside `choresService.writeChores()` with `choresService.createChoreIn()`.
- Data that belongs to a household is always queried with the household id in the `WHERE` clause, so an id from another household reads as missing (404) and never leaks.
- Table files may import other features' tables, because foreign keys cross features.
- The one repo that writes other features' tables is `demo.repo.ts`: it seeds a demo household with backdated history (which no service would accept) and deletes a whole demo when it ends. What a visitor does inside the demo goes through the usual services.
- Each feature mounts under its own path in `app.ts`. A feature that needs a signed-in user builds its router with `protectedRouter()`, so every route in it returns 401 without a session and 403 for a state-changing request from another origin (`lib/same-origin.ts`).
- When a rule depends on other rows (the last member leaving deletes the household, the owner leaving hands over ownership), the service locks the parent row first (`householdsRepo.lockHousehold`) and re-reads under the lock. Concurrent requests then run one after another instead of acting on stale reads.
- DB-specific error handling stays in the repo: it turns a constraint conflict into a plain result (`null` or `false`) that the service can act on, using `onConflictDoNothing`, or a savepoint plus `db/pg-errors.ts` where an insert can't skip conflicts.

### Tests

Tests sit next to the code they cover, in the feature that owns the route: `features/<name>/<name>.test.ts`, `lib/connection.test.ts`, `server.test.ts`. `pnpm test <name>` runs one feature's tests in both apps. API tests are integration tests against a real database; the shared setup lives in `apps/api/test/`: `global-setup.ts` prepares the test database, and `harness.ts` provides:

- `signUp()`: a user with a real session;
- `householdWith()`: a household with the given users in it;
- `json()` and `errorCode()`: they assert the status and return the typed body or the error code.

Each test makes its own users and households, so tests don't depend on each other or on order. Web unit tests sit next to the code they test too.

### Adding an API feature

1. Create `features/<name>/` with the files from the list above that it needs, starting from the contract (`<name>.schema.ts`).
2. Re-export its `<name>.table.ts` from `db/schema.ts`, then run `pnpm db:generate` and `pnpm db:migrate`.
3. Mount its router in `app.ts` with `.route("/<name>", <name>Routes)`. The web app's RPC client picks it up from the types.
4. In the service, `annotate("<name>", { ... })` the ids and counts someone debugging a request would want.
5. Add `features/<name>/<name>.test.ts`, including a test that another household (or another person, for private data) gets a 404 for every route.

## Web (`apps/web/src`)

```
routes/                   TanStack file routes: URL, guards, loaders, search params, layout (thin)
features/<name>/          one folder per feature. For example:
  chores/
    chores.api.ts         RPC calls and their response types
    chores.queries.ts     React Query keys and queryOptions (loaders and components share them)
    chores.changes.ts     the writes: marking done, putting off, and taking either back
    chores.hooks.ts       what components use: the data plus the changes people make to it
    chore-dates.ts        domain logic that isn't a role, named for what it does
    components/           every .tsx: rows, forms, sheets, buttons and pages
components/               shared: shadcn ui/ (extended with taskhold variants, see apps/web/DESIGN.md), layout/
                          (the shells with nav, headings, groups), and small app-wide pieces
lib/                      shared, and usable by every feature: the RPC client (api.ts), dates, theme, offline
                          changes and cache, live updates, the push device, feedback toasts
```

- Server data that changes while a page is open (shopping lists, chores, to-dos) goes through React Query. Loaders call `context.queryClient.ensureQueryData(...)` with the feature's `queryOptions`, and components read the same query with `useSuspenseQuery`. Simpler, load-once data (the household) still comes straight from route loaders.
- Writes to an area's data are **changes** (see [GLOSSARY.md](GLOSSARY.md)), declared in `<feature>.changes.ts` with `defineChange` from `lib/offline-changes.ts`. A change says what it sends, which query it shows in, and what that query looks like afterwards (`apply`), or, when only the API knows, how its answer goes in (`settle`). The module does the rest: shows it straight away, waits for a connection, survives a restart, rolls back with a `changeFailed` notice, and refetches the area after its last pending change, so an early response can't undo a later one.
- Each area's changes are registered once in `router.tsx` with `registerAllChanges`, so changes saved on the device can resume after a restart. It takes one entry per area, so a new area can't be left out. The areas (`AREAS` in `lib/offline-changes.ts`) are checked against the API's live topics, and what's saved on the device and which live messages the app accepts are built from those two lists. A change's key (`[area, "change", name]`) and the shape of its variables are saved with it, so renaming one strands changes still waiting on people's phones.
- Undo comes with the change: declare which change takes it back and with what (`undo`), and pass an `UndoOffer` when running it to show the notice. The exception is deleting chores, which waits for the Undo toast to close before the change runs, so the delete isn't saved until then ([ADR 0001](docs/adr/0001-chore-deletes-wait-for-the-undo-window.md)). Changes marked `ordered` run one after another within their area, so an undo can't reach the API before what it undoes; a change and its undo must both be ordered.
- Components run changes through their feature's hooks, which use `useChange`. Lint stops features importing `useMutation` or `mutationOptions`. A form checks what it can before running a change, then closes straight away, offline too; a failure the API reports rolls back with the change's notice. Don't make a form wait for the API's answer (`runAsync`): without a connection it would wait until there is one.
- Every write to an area's data is a change. When the screen needs something only the API would give, such as a new list's id to open it, the app chooses it and sends it with the change (`POST /api/shopping/lists` takes the app's id). Writes outside the areas (households, account, reminder settings) call their feature's `*.api.ts` and need a connection.
- Route files stay thin. They decide when a page shows and what data it gets, then render a page from a feature. Pages read route data with `getRouteApi("/path")`.
- Features don't import each other. When a screen needs two features, its route composes them. For example, `routes/_household.tsx` puts the shopping feature's dock field, or the add trigger on Chores and To-dos, into the shared household shell, and `routes/_household/household/index.tsx` passes the reminders feature's Notifications row into the household page.
- Inside a feature, imports are relative. Every `.tsx` is in `components/` and every `.ts` at the feature's root, so a file's path follows from its name; nothing else nests.
- Shared code (`components/`, `lib/`) never imports a feature or a route.

## Dates and times

Both apps use the [Temporal API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal), not `Date`.

- **API:** Node 26 has `Temporal` built in. `db/columns.ts` defines two column types:
  - `instant()` reads a `timestamp` column as a `Temporal.Instant`, in UTC;
  - `plainDate()` reads a `date` column as a `Temporal.PlainDate`.

  Table files use them instead of `timestamp()` and `date()`, with `.default(now)` instead of `.defaultNow()`. Both produce the same SQL as before. Timestamps are stored in UTC, and `now()` defaults assume the database's time zone is UTC, as it is in `compose.yaml`.

- **Better Auth's tables** (`auth.table.ts`, generated) keep `Date`, because Better Auth reads and writes those columns itself.
- **Responses:** Temporal values become ISO strings in JSON: instants like `2026-11-01T13:42:14.4528Z`, dates like `2026-11-01`. The web app's RPC types see them as strings.
- **Web:** `main.tsx` imports `temporal-polyfill/global` first, which installs `Temporal` only in browsers without one (Safari, and older Chrome and Firefox). Don't use `Temporal` at module top level in a file that might load before it.
- **Comparing timestamps:** use `Temporal.Instant.compare`, not string comparison. ISO strings vary in precision (`…:00Z` vs `…:00.5Z`).
- **Not converted:** `performance.now()` stays for measuring request durations, because it's monotonic and not a date. pino's log timestamps come from pino itself.

## Enforced by lint and repo invariants

`.oxlintrc.json` turns these rules into lint errors, and `test/repo-invariants.test.ts` plus `knip` catch cross-package drift and dead code, so `pnpm check` fails when a file reaches across a boundary:

- API routes and middleware can't import a repo, a table, the database client or `drizzle-orm`.
- API services can't build queries (no `drizzle-orm`, no `db`), can't import routes/middleware, and can't import another feature's repo or routes. Routes can't import another feature's routes.
- API domain helpers and other non-role feature files can't import `drizzle-orm`, repos, runtime tables, `db`, or the HTTP layer. Tables and schemas can't import `db`, repos, services or routes.
- API repo files can't import services or routes. `lib/` and `env.ts` can't import features.
- The files the web app bundles from the API (`chore-schedule.ts`, `invite-code.ts`, `live-topics.ts`) import types only.
- No import cycles, in either app.
- Web shared code can't import features, routes or the router. Features can't import routes, the router or other features, keep `.ts` files at the feature's root and `.tsx` components directly in `components/`, and can't add other subfolders.
- Web features don't import `useMutation` or `mutationOptions`: writes are changes (`lib/offline-changes.ts`). Feature components run changes through their feature's `*.hooks.ts` (no direct `useChange`, `useWaitingVars`, or runtime `*.changes.ts` imports). Components of the areas (shopping, chores, to-dos) import only types from their feature's `*.api.ts`.
- Web code imports icons from `components/icons.ts`, never from `@phosphor-icons/react`, so the icon library can be swapped in one file. Only `icons.ts` and the shadcn files in `components/ui/` import the library.
- `Date` is disallowed everywhere except generated `auth.table.ts`: use `Temporal` (and `performance.now()` for durations).
- Source files stay under 500 non-blank, non-comment lines (tests, shadcn `components/ui/`, and `grocery-words.ts` are exempt).
- Default exports are errors everywhere except tool configs (`*.config.ts`).
- `test/repo-invariants.test.ts` checks that `.oxlintrc.json` regexes are valid for oxlint's Rust regex engine, every shared API export is in `.oxlintrc.json`'s types-only override, every `*.table.ts` is re-exported in `db/schema.ts`, every `*.routes.ts` is mounted in `app.ts`, every `AREA` is covered in `.oxlintrc.json`, web feature folders stay flat, and the API/web offline max-age constants stay in sync.
- `pnpm knip` checks for unused files, exports, types and dependencies across workspaces.
