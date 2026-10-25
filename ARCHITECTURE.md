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
lib/                      feature-agnostic helpers: AppError, error handler, validate()
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
- A feature may call another feature's service, never its DAL. `viewer` uses `auth` and `households` this way.
- Schema files may import other features' tables, because foreign keys cross features.
- Each feature mounts under its own path in `app.ts`. A feature that needs a signed-in user builds its router with `protectedRouter()`, so every route in it returns 401 without a session.
- When a rule depends on other rows (the last member leaving deletes the household, the owner leaving hands over ownership), the service locks the parent row first (`householdsDal.lockHousehold`) and re-reads under the lock. Concurrent requests then run one after another instead of acting on stale reads.
- DB-specific error handling stays in the DAL: it turns a constraint conflict into a plain result (`null` or `false`) that the service can act on, using `onConflictDoNothing`, or a savepoint plus `db/errors.ts` where an insert can't skip conflicts.

### Adding an API feature

1. Create `features/<name>/` with the files from the list above that it needs.
2. Export its tables from `db/schema.ts`, then run `pnpm db:generate` and `pnpm db:migrate`.
3. Mount its router in `app.ts` with `.route("/<name>", <name>Routes)`. The web app's RPC client picks it up from the types.

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
    components/           household-members, invite-code-slots
    pages/                setup, create, join, invite, overview
components/               shared: shadcn ui/, layout/ (app shell, page heading), small app-wide pieces
lib/                      shared: RPC client and errorMessage(), utils
```

- Route files stay thin. They decide when a page shows and what data it gets, then render a page from a feature. Pages read route data with `getRouteApi("/path")`.
- Features don't import each other. When a screen needs two features, its route composes them. For example, `routes/_household.tsx` puts the auth feature's sign-out button into the shared app shell.
- Inside a feature, imports are relative and folders are one level deep (`components/`, `pages/`, `hooks/`).
- Shared code (`components/`, `lib/`) never imports a feature or a route.

## Enforced by lint

`.oxlintrc.json` turns these rules into `no-restricted-imports` errors, so `pnpm check` fails when a file reaches across a boundary:

- API routes and middleware can't import a DAL, a schema, the database client or `drizzle-orm`.
- API services can't build queries (no `drizzle-orm`, no `db`) and can't import another feature's DAL.
- API DAL files can't import services or routes. `lib/` and `config/` can't import features.
- Web shared code can't import features or routes. Features can't import routes or other features, and can't nest folders more than one level deep.
