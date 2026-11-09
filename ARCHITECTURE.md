# Architecture

Both apps are organized by feature (vertical slices). A feature folder holds everything for one area of the product, so adding or changing a feature mostly touches one folder. Lint rules keep the layers from reaching into each other.

## API (`apps/api/src`)

```
index.ts                  starts the HTTP server, shuts down cleanly on SIGTERM/SIGINT
server.ts                 the API plus, in production (WEB_ROOT), the web app's build on one origin
app.ts                    composes the API: middleware, error handler, one router per feature
rpc-client.ts             typed RPC client for the web app (@taskhold/api/client)
env.ts                    environment, validated with zod at startup
db/db.ts                  Postgres pool (with timeouts), Drizzle instance, transaction()
db/migrate.ts             applies migrations at container start
db/schema.ts              re-exports every feature's *.table.ts, for migrations and relational queries
lib/                      feature-agnostic infrastructure: AppError, error handler, validate(), logger, wide events
features/
  auth/                   Better Auth instance (auth.ts), its generated tables, requireAuth and protectedRouter()
  households/
    households.routes.ts      HTTP: routes, input validation, status codes
    households.service.ts     business rules: who may create, join, see what
    households.repo.ts        data access: the only file that queries household tables
    households.table.ts       Drizzle tables
    households.schema.ts      the contract: zod schemas for request input and the shapes returned to clients
    households.errors.ts      the feature's AppErrors
    households.test.ts        integration tests for the feature's routes
    invite-code.ts            pure domain logic: generate and normalize codes
  shopping/               shopping lists and items, scoped to the user's household
  chores/                 chores and their history; chore-schedule.ts holds the due-date rules, shared with the web app
  todos/                  private to-dos, scoped to the user rather than a household; can move one to chores
  reminders/              push subscriptions and reminder settings; reminders.scheduler.ts sends due reminders
  live/                   server-sent change notifications
  viewer/                 GET /api/viewer, composed from the auth and households services
```

### Layers

Requests flow `routes → service → repo → database`, never backwards.

| Layer          | Does                                                                                     | Doesn't                                     |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| `*.routes.ts`  | Validates input with `validate()`, reads the user, picks status codes                    | Touch the database or decide business rules |
| `*.service.ts` | Enforces business rules, groups repo calls with `transaction()`, throws `AppError`       | Build queries or know about HTTP            |
| `*.repo.ts`    | Runs Drizzle queries, returns plain records, takes an optional executor for transactions | Call services or decide what's allowed      |

- Services throw `AppError(kind, code, message)`. `lib/error-handler.ts` maps the `kind` to a status code and responds with `{ error: { code, message } }`.
- Every request is logged as one wide event (`lib/request-logger.ts`). Services add what they know about the request with `annotate(group, fields)` from `lib/wide-event.ts`, using ids and counts, never names, codes or other user content. Don't log separate lines during a request: add to its event instead.
- A rule the web app needs too (what marking a chore done or skipping it does to its due date) lives once in the API and is exported for the web app in `package.json`, like the RPC client: `features/chores/chore-schedule.ts` is `@taskhold/api/chore-schedule`. The web app bundles that file, so it may import types only (lint enforces it), and it stays free of HTTP and the database: the service applies its answers inside its transaction.
- A feature may call another feature's service, never its repo. `viewer` uses `auth` and `households` this way, `shopping` asks `householdsService.getMembershipOf()` which household a user is in, and `todos` calls `choresService.createChore()` to move a to-do to chores.
- Data that belongs to a household is always queried with the household id in the `WHERE` clause, so an id from another household reads as missing (404) and never leaks.
- Table files may import other features' tables, because foreign keys cross features.
- Each feature mounts under its own path in `app.ts`. A feature that needs a signed-in user builds its router with `protectedRouter()`, so every route in it returns 401 without a session and 403 for a state-changing request from another origin (`lib/same-origin.ts`).
- When a rule depends on other rows (the last member leaving deletes the household, the owner leaving hands over ownership), the service locks the parent row first (`householdsRepo.lockHousehold`) and re-reads under the lock. Concurrent requests then run one after another instead of acting on stale reads.
- DB-specific error handling stays in the repo: it turns a constraint conflict into a plain result (`null` or `false`) that the service can act on, using `onConflictDoNothing`, or a savepoint plus `db/pg-errors.ts` where an insert can't skip conflicts.

### Tests

Tests sit next to the code they cover: `features/<name>/<name>.test.ts`, `lib/connection.test.ts`, `server.test.ts`. `pnpm test <name>` runs one feature's tests in both apps. API tests are integration tests against a real database; the shared setup lives in `apps/api/test/`: `global-setup.ts` prepares the test database, and `harness.ts` provides:

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
features/
  auth/                   small, so flat
    auth.api.ts           RPC calls: fetchViewer
    redirect.ts           sanitizes the post-sign-in redirect
    SignInPage.tsx, GoogleSignInButton.tsx, SignOutButton.tsx, DeleteAccountButton.tsx
  households/
    households.api.ts     RPC calls and their response types
    invite-code.ts        format and parse invite codes (mirrors the API's)
    components/           HouseholdMembers, InviteCodeSlots, leave/remove/new-code buttons, and the
                          setup, create, join, invite and overview pages
  shopping/
    shopping.api.ts       RPC calls and their response types
    shopping.queries.ts   React Query keys and queryOptions (loaders and components share them)
    shopping.changes.ts   changes to a list's items, registered in router.tsx so they can resume
    shopping.hooks.ts     useShoppingList: the list plus the changes people make to it
    components/           QuickAdd (the round + button), NewListForm, ShoppingItemRow, list buttons, and
                          the all-lists and single-list pages
  chores/
    chores.api.ts         RPC calls and their response types
    chores.queries.ts     React Query keys and queryOptions
    chores.changes.ts     marking done, putting off, and taking either back
    chores.hooks.ts       useChores: the chores plus marking done; usePutOff: tomorrow and skip
    chore-dates.ts        scheduleOf (a chore for the API's schedule rules) and repeat labels; general date
                          helpers are in lib/dates.ts
    components/           ChoreForm, ChoreRow, ChoreSheet, NewChoreDrawer, AddChoreButton, ChoresPage
  todos/
    todos.api.ts, todos.queries.ts, todos.changes.ts
    todos.hooks.ts        useTodos: the to-dos plus the changes to them
    components/           TodoForm, TodoRow, TodoSheet (with move to chores), NewTodoDrawer, AddTodoButton,
                          TodosPage (the Personal page)
  reminders/              small, so flat: reminders.api.ts, reminders.queries.ts, reminders.hooks.ts,
                          ChoreReminders.tsx
components/               shared: shadcn ui/ (extended with taskhold variants, see apps/web/DESIGN.md), layout/
                          (HouseholdShell with nav, AppShell for onboarding, PageHeading, Group, EmptyState),
                          ThemeProvider and ThemeToggle, small app-wide pieces (AddRow, SharedWithLine,
                          ConfirmDialog, UserAvatar, Wordmark, PageSkeleton)
lib/                      shared: RPC client and errorMessage() (api.ts), dates (due groups and labels),
                          theme context and useTheme(), offline changes and cache, feedback toasts
```

- Server data that changes while a page is open (shopping lists, chores, to-dos) goes through React Query. Loaders call `context.queryClient.ensureQueryData(...)` with the feature's `queryOptions`, and components read the same query with `useSuspenseQuery`. Simpler, load-once data (the household) still comes straight from route loaders.
- Writes to an area's data are **changes** (see [GLOSSARY.md](GLOSSARY.md)), declared in `<feature>.changes.ts` with `defineChange` from `lib/offline-changes.ts`. A change says what it sends, which query it shows in, and what that query looks like afterwards (`apply`), or, when only the API knows, how its answer goes in (`settle`). The module does the rest: shows it straight away, waits for a connection, survives a restart, rolls back with a `changeFailed` notice, and refetches the area after its last pending change, so an early response can't undo a later one.
- Each feature's changes are registered once in `router.tsx` with `registerChanges`, so changes saved on the device can resume after a restart. A change's key (`[area, "change", name]`) and the shape of its variables are saved with it, so renaming one strands changes still waiting on people's phones.
- Undo comes with the change: declare which change takes it back and with what (`undo`), and pass an `UndoOffer` when running it to show the notice. Changes marked `ordered` run one after another within their area, so an undo can't reach the API before what it undoes; a change and its undo must both be ordered.
- Components run changes through their feature's hooks, which use `useChange`. Lint stops features importing `useMutation` or `mutationOptions`. Errors in forms and dialogs stay next to the form: forms use `runAsync`, and a change with `failure: false` leaves the notice to them.
- Route files stay thin. They decide when a page shows and what data it gets, then render a page from a feature. Pages read route data with `getRouteApi("/path")`.
- Features don't import each other. When a screen needs two features, its route composes them. For example, `routes/_household.tsx` puts the shopping feature's quick-add button, or the chores feature's add button on the chores page, into the shared household shell, and `routes/_household/household.tsx` passes the auth feature's sign-out button into the household page.
- Inside a feature, imports are relative. A feature stays flat until it has about 10 files; then its components and pages move to `components/`, and nothing else nests.
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

## Enforced by lint

`.oxlintrc.json` turns these rules into `no-restricted-imports` errors, so `pnpm check` fails when a file reaches across a boundary:

- API routes and middleware can't import a repo, a table, the database client or `drizzle-orm`.
- API services can't build queries (no `drizzle-orm`, no `db`) and can't import another feature's repo.
- API repo files can't import services or routes. `lib/` and `env.ts` can't import features.
- `chore-schedule.ts`, which the web app bundles, imports types only.
- Web shared code can't import features or routes. Features can't import routes or other features, and can't nest folders more than one level deep.
- Web features don't import `useMutation` or `mutationOptions`: writes are changes (`lib/offline-changes.ts`).
- Web code imports icons from `components/icons.ts`, never from `@phosphor-icons/react`, so the icon library can be swapped in one file. Only `icons.ts` and the shadcn files in `components/ui/` import the library.
- Default exports are errors everywhere except tool configs (`*.config.ts`).
