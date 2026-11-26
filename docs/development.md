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
- **Browser** (`e2e/`, [Playwright](https://playwright.dev)): one smoke test of the production build in a phone-sized Chromium. It starts a demo, has a housemate tick an item and waits for the change to arrive over live updates, checks the service worker installs, and fails on any console error, so a Content Security Policy violation or a broken bundle shows up before the deploy. It runs against the Docker image rather than the dev server: `pnpm test:e2e` builds the image, starts it on port 3100 on a fresh `taskhold_e2e` database in the Docker Postgres (`e2e/serve-image.sh`), and stops it afterwards. Postgres must be running (`pnpm db:up`), and Playwright's browser installed once (`pnpm exec playwright install chromium`). Set `E2E_BASE_URL` to test an app that's already running instead.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`, in three jobs side by side:

- **Format, lint, typecheck, build:** `pnpm check`, then `pnpm build`, then `pnpm db:generate` must produce no new files in `apps/api/drizzle`, so a `*.table.ts` change can't reach production without its migration.
- **Tests:** `pnpm test:ci` (the repo invariants, then both apps' tests, failing if a package runs none) against a Postgres 18 service container, with `TEST_DATABASE_URL` pointing at `taskhold_test`.
- **Docker image and browser test:** `docker build`, so a mistake in the `Dockerfile`'s copy list or `pnpm deploy` shows up before the merge rather than in Coolify. Then it starts the image on an empty Postgres 18 service container, as production runs it, and runs the browser test against it. A failed run uploads the Playwright trace and prints the server's logs.

On a push to `main`, a fourth job deploys once all three pass (see [Deploying](operations.md#deploying)), so a red build never reaches production. Actions are pinned to commit SHAs, with the tag in a comment; update both together.

## Scripts

| Command               | What it does                                           |
| --------------------- | ------------------------------------------------------ |
| `pnpm dev`            | Start both apps in watch mode                          |
| `pnpm dev:api`        | Start only the API                                     |
| `pnpm dev:web`        | Start only the frontend                                |
| `pnpm build`          | Build all apps                                         |
| `pnpm typecheck`      | Typecheck all apps, tests included                     |
| `pnpm test`           | Run all tests (needs Postgres: `pnpm db:up`)           |
| `pnpm test:web`       | Run only web tests (fast, no Postgres needed)          |
| `pnpm test:api`       | Run only API tests (needs Postgres: `pnpm db:up`)      |
| `pnpm test <feature>` | Run one feature's tests, e.g. `pnpm test chores`       |
| `pnpm test:e2e`       | Build and start the Docker image, test it in a browser |
| `pnpm lint`           | Lint everything with oxlint                            |
| `pnpm format`         | Format everything with oxfmt                           |
| `pnpm check`          | Format check, lint, typecheck, repo invariants, `knip` |
| `pnpm db:up`          | Start Postgres (Docker) and wait until healthy         |
| `pnpm db:down`        | Stop Postgres (data is kept in a Docker volume)        |
| `pnpm db:generate`    | Generate a migration from the Drizzle schema           |
| `pnpm db:migrate`     | Apply pending migrations                               |
| `pnpm db:studio`      | Open Drizzle Studio                                    |
| `pnpm auth:generate`  | Regenerate the Better Auth Drizzle schema              |
