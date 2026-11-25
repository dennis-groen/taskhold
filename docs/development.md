# Working on taskhold

The typed API client, database migrations, tests, CI and scripts. Setup is in the [README](../README.md#getting-started); [ARCHITECTURE.md](../ARCHITECTURE.md) explains the layers and lint rules.

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

On a push to `main`, a third job deploys once both pass (see [Deploying](operations.md#deploying)), so a red build never reaches production. Actions are pinned to commit SHAs, with the tag in a comment; update both together.

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
