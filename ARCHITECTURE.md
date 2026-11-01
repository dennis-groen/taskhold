# Architecture

Both apps are organized by feature (vertical slices). A feature folder holds everything for one area of the product, so adding or changing a feature mostly touches one folder. Lint rules keep the layers from reaching into each other.

## API (`apps/api/src`)

```
index.ts                  starts the HTTP server, shuts down cleanly on SIGTERM/SIGINT
app.ts                    composes the app: middleware, error handler, one router per feature
client.ts                 typed RPC client for the web app (@taskhold/api/client)
config/env.ts             environment, validated with zod at startup
db/client.ts              Postgres pool, Drizzle instance, transaction()
db/schema.ts              every feature's tables, for migrations and relational queries
lib/                      feature-agnostic helpers: AppError, error handler, validate(), logger, wide events
features/
  auth/                   Better Auth instance, its tables, requireAuth and protectedRouter()
  households/
    households.routes.ts      HTTP: routes, input validation, status codes
    households.service.ts     business rules: who may create, join, see what
    households.dal.ts         data access: the only file that queries household tables
    households.schema.ts      Drizzle tables and relations
    households.validation.ts  zod schemas for request input
    households.errors.ts      the feature's AppErrors
    households.types.ts       shapes returned to clients
    invite-code.ts            pure domain logic: generate and normalize codes
  shopping/               shopping lists and items, scoped to the user's household
  chores/                 chores and their completions; chore-dates.ts holds the due-date rules
  todos/                  private to-dos, scoped to the user rather than a household; can move one to chores
  viewer/                 GET /api/viewer, composed from the auth and households services
```

### Layers

Requests flow `routes → service → dal → database`, never backwards.

| Layer          | Does                                                                                     | Doesn't                                     |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `*.routes.ts`  | Validates input with `validate()`, reads the user, picks status codes                    | Touch the database or decide business rules |
| `*.service.ts` | Enforces business rules, groups DAL calls with `transaction()`, throws `AppError`        | Build queries or know about HTTP            |
| `*.dal.ts`     | Runs Drizzle queries, returns plain records, takes an optional executor for transactions | Call services or decide what's allowed      |

- Services throw `AppError(kind, code, message)`. `lib/error-handler.ts` maps the `kind` to a status code and responds with `{ error: { code, message } }`.
- Every request is logged as one wide event (`lib/request-logger.ts`). Services add what they know about the request with `annotate(group, fields)` from `lib/wide-event.ts`, using ids and counts, never names, codes or other user content. Don't log separate lines during a request: add to its event instead.
- A feature may call another feature's service, never its DAL. `viewer` uses `auth` and `households` this way, `shopping` asks `householdsService.getMembershipOf()` which household a user is in, and `todos` calls `choresService.createChore()` to move a to-do to chores.
- Data that belongs to a household is always queried with the household id in the `WHERE` clause, so an id from another household reads as missing (404) and never leaks.
- Schema files may import other features' tables, because foreign keys cross features.
- Each feature mounts under its own path in `app.ts`. A feature that needs a signed-in user builds its router with `protectedRouter()`, so every route in it returns 401 without a session and 403 for a state-changing request from another origin (`lib/same-origin.ts`).
- When a rule depends on other rows (the last member leaving deletes the household, the owner leaving hands over ownership), the service locks the parent row first (`householdsDal.lockHousehold`) and re-reads under the lock. Concurrent requests then run one after another instead of acting on stale reads.
- DB-specific error handling stays in the DAL: it turns a constraint conflict into a plain result (`null` or `false`) that the service can act on, using `onConflictDoNothing`, or a savepoint plus `db/errors.ts` where an insert can't skip conflicts.

### Adding an API feature

1. Create `features/<name>/` with the files from the list above that it needs.
2. Export its tables from `db/schema.ts`, then run `pnpm db:generate` and `pnpm db:migrate`.
3. Mount its router in `app.ts` with `.route("/<name>", <name>Routes)`. The web app's RPC client picks it up from the types.
4. In the service, `annotate("<name>", { ... })` the ids and counts someone debugging a request would want.

## Web (`apps/web/src`)

```
routes/                   TanStack file routes: URL, guards, loaders, search params, layout
features/
  auth/
    auth.api.ts           RPC calls: fetchViewer
    redirect.ts           sanitizes the post-sign-in redirect
    components/           Google sign-in and sign-out buttons
    pages/                sign-in page
  households/
    households.api.ts     RPC calls and their response types
    invite-code.ts        format and parse invite codes
    components/           household-members, invite-code-slots, leave/remove/new-code buttons
    pages/                setup, create, join, invite, overview
  shopping/
    shopping.api.ts       RPC calls and their response types
    shopping.queries.ts   React Query keys and queryOptions (loaders and components share them)
    hooks/                use-shopping-list: the list plus optimistic changes
    components/           quick add (the round + button), new-list form, item row, delete-list button
    pages/                all lists, a single list
  chores/
    chores.api.ts         RPC calls and their response types
    chores.queries.ts     React Query keys and queryOptions
    chore-dates.ts        repeat rule (mirrors the API's) and repeat labels; general date helpers are in lib/dates.ts
    hooks/                use-chores: the chores plus optimistic marking done
    components/           chore form, row, sheet, new-chore drawer, add button, undo bar
    pages/                chores page
  todos/
    todos.api.ts          RPC calls and their response types
    todos.queries.ts      React Query keys and queryOptions
    hooks/                use-todos: the to-dos plus optimistic changes
    components/           to-do form, row, sheet (with move to chores), new-to-do drawer, add button
    pages/                Personal page
components/               shared: shadcn ui/, layout/ (household shell with nav, onboarding app shell, page heading, group), small app-wide pieces (add row, shared-with line, confirm dialog, avatar)
lib/                      shared: RPC client and errorMessage(), dates (due groups and labels), utils
```

- Server data that changes while a page is open (shopping lists, chores, to-dos) goes through React Query. Loaders call `context.queryClient.ensureQueryData(...)` with the feature's `queryOptions`, and components read the same query with `useSuspenseQuery`. Simpler, load-once data (the household) still comes straight from route loaders.
- Optimistic changes follow `hooks/use-shopping-list.ts`: update the cache in `onMutate`, roll back in `onError`, and refetch only when the last pending change on that list settles, so an early response can't undo a later change.
- Route files stay thin. They decide when a page shows and what data it gets, then render a page from a feature. Pages read route data with `getRouteApi("/path")`.
- Features don't import each other. When a screen needs two features, its route composes them. For example, `routes/_household.tsx` puts the shopping feature's quick-add button, or the chores feature's add button on the chores page, into the shared household shell, and `routes/_household/household.tsx` passes the auth feature's sign-out button into the household page.
- Inside a feature, imports are relative and folders are one level deep (`components/`, `pages/`, `hooks/`).
- Shared code (`components/`, `lib/`) never imports a feature or a route.

## Dates and times

Both apps use the [Temporal API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal), not `Date`.

- **API:** Node 26 has `Temporal` built in. `db/columns.ts` defines two column types:
  - `instant()` reads a `timestamp` column as a `Temporal.Instant`, in UTC;
  - `plainDate()` reads a `date` column as a `Temporal.PlainDate`.

  Schemas use them instead of `timestamp()` and `date()`, with `.default(now)` instead of `.defaultNow()`. Both produce the same SQL as before. Timestamps are stored in UTC, and `now()` defaults assume the database's time zone is UTC, as it is in `compose.yaml`.

- **Better Auth's tables** (`auth.schema.ts`, generated) keep `Date`, because Better Auth reads and writes those columns itself.
- **Responses:** Temporal values become ISO strings in JSON: instants like `2026-11-01T13:42:14.4528Z`, dates like `2026-11-01`. The web app's RPC types see them as strings.
- **Web:** `main.tsx` imports `temporal-polyfill/global` first, which installs `Temporal` only in browsers without one (Safari, and older Chrome and Firefox). Don't use `Temporal` at module top level in a file that might load before it.
- **Comparing timestamps:** use `Temporal.Instant.compare`, not string comparison. ISO strings vary in precision (`…:00Z` vs `…:00.5Z`).
- **Not converted:** `performance.now()` stays for measuring request durations, because it's monotonic and not a date. pino's log timestamps come from pino itself.

## Enforced by lint

`.oxlintrc.json` turns these rules into `no-restricted-imports` errors, so `pnpm check` fails when a file reaches across a boundary:

- API routes and middleware can't import a DAL, a schema, the database client or `drizzle-orm`.
- API services can't build queries (no `drizzle-orm`, no `db`) and can't import another feature's DAL.
- API DAL files can't import services or routes. `lib/` and `config/` can't import features.
- Web shared code can't import features or routes. Features can't import routes or other features, and can't nest folders more than one level deep.
