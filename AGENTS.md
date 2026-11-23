# taskhold

A phone-first PWA for people who share a household: shared shopping lists, chores with reminders, and private to-dos.

[ARCHITECTURE.md](ARCHITECTURE.md) explains the layers, data flow and lint rules in full. This file is the short map. [GLOSSARY.md](GLOSSARY.md) holds the domain's words; [apps/web/DESIGN.md](apps/web/DESIGN.md) and [apps/web/PRODUCT.md](apps/web/PRODUCT.md) cover the UI tokens, components, and product constraints.

## Commands

- `pnpm dev`: run the API (port 3000) and web app (port 5173)
- `pnpm check`: format check, lint and typecheck. Run it before finishing any task
- `pnpm test`: all tests (the API's need Postgres: `pnpm db:up`)
- `pnpm test:web`: web unit tests only (fast, no Postgres needed)
- `pnpm test:api`: API integration tests only (needs Postgres: `pnpm db:up`)
- `pnpm test <feature>`: one feature's tests in both apps, e.g. `pnpm test chores`
- `pnpm test:ci`: all tests, failing if a package runs none (what CI runs)
- `pnpm db:generate` then `pnpm db:migrate`: after changing a `*.table.ts`
- `pnpm auth:generate`: after changing Better Auth's config; rewrites `auth.table.ts`

## Layout

- `apps/api/src/features/<noun>/`: routes, service, repo, table, schema, errors, tests
- `apps/api/src/app.ts`: every router is mounted here, and nowhere else
- `apps/api/src/db/schema.ts`: re-exports every `*.table.ts`, listed by hand
- `apps/api/src/lib/`: infrastructure only (AppError, error handler, logger, push). No business logic
- `apps/api/test/`: shared test setup only (`harness.ts`, `global-setup.ts`)
- `apps/web/src/features/<noun>/`: api, queries, changes, hooks, components
- `apps/web/src/routes/`: thin TanStack file routes that compose feature components
- `apps/web/src/components/ui/`: shadcn primitives; never import a feature
- `apps/web/src/components/icons.ts`: every icon the app uses; import icons from here, never from `@phosphor-icons/react`
- `apps/web/src/lib/api.ts`: the typed RPC client; every API call goes through it

## Features

Folder names match in both apps and follow the API path (`/api/<feature>`). The web app's URLs are older than some of the names: `/lists` is shopping, `/personal` is todos, `/household`, `/invite`, `/onboarding` and `/join` are households, and `/dashboard` only redirects to `/lists`.

- auth: Google sign-in through Better Auth, sign-out, account deletion
- households: create, join with an invite code, members, leave
- shopping: shared lists and items with categories, quick add (reads "2 milk" as milk, 2, and catches items already on the list), editing items, offline ticks, "buy again" suggestions
- chores: shared chores with repeat rules, marking done, skipping a time or putting it off to tomorrow, history
- todos: private to-dos, can be moved to chores
- reminders: push reminders for chores (API scheduler and device settings)
- live (API only): server-sent change notifications. The web side is `lib/live-updates.ts`, which every feature may use
- viewer (API only): `GET /api/viewer`, who is signed in and their household, and account deletion. The web side is `features/auth/auth.api.ts`

## Conventions

- API files: `<feature>.<role>.ts`. Roles: `routes`, `service`, `repo`, `table`, `schema` (zod contract: request input and response shapes), `errors`, `middleware`, `scheduler`, `test`
- Web files: `<feature>.<role>.ts`. Roles: `api` (RPC calls), `queries` (query keys and queryOptions), `changes` (writes, declared with `defineChange` from `lib/offline-changes.ts`), `hooks`, `test`
- Domain logic that isn't a role gets a descriptive name: `invite-code.ts`, `chore-schedule.ts`
- A rule both apps need lives once in the API and the web app imports it through an export in `apps/api/package.json` (`chore-schedule.ts` as `@taskhold/api/chore-schedule`). Such a file imports types only, which lint enforces once the file is listed in that override in `.oxlintrc.json`. The exports list is the full set
- A file name is used once per app for one thing: don't reuse a name from the other app for something unrelated
- Components: PascalCase file named after the component it exports (`ChoreRow.tsx` exports `ChoreRow`)
- In a web feature, every `.tsx` goes in `components/` and every `.ts` sits at the feature's root (lint enforces it). No other subfolders
- Tests sit next to their source as `*.test.ts`
- Named exports only (lint enforces it; tool configs are exempt). No `index.ts` barrels
- No `utils`, `helpers` or `common` files. Name a module by what it does
- Routes never touch the database; services never touch HTTP objects; features call each other's services, never their repos or routes
- oxlint ignores a `regex` it can't parse (look-around, a typo) without saying so. After adding a lint rule, write an import that breaks it and check that `pnpm lint` fails
- Errors: throw an `AppError` from the feature's `*.errors.ts`
- Imports: `@/` means `apps/web/src`. It's the only alias; the API uses relative imports

## Do not edit

- `apps/web/src/routeTree.gen.ts`: generated by the TanStack Router plugin
- `apps/api/drizzle/*`: migrations; generate them with `pnpm db:generate`
- `apps/api/src/features/auth/auth.table.ts`: generated with `pnpm auth:generate`
- `apps/web/src/components/ui/*`: from the shadcn CLI; extend with variants, keep the files diffable

## Gotchas and invariants

- **Offline persistence compatibility:** Never rename a `defineChange` key or change its `vars` shape without bumping `VERSION` in `apps/web/src/lib/offline-cache.ts`, or queued offline changes on people's phones will be stranded or fail to replay
- **React Compiler is enabled** (`babel-plugin-react-compiler` in `apps/web`): skip manual `useMemo`/`useCallback` for ordinary renders; use them only when referential stability is needed at an effect or non-React boundary
- **RPC type flow:** `apps/web` references `apps/api/tsconfig.build.json` (`tsc -b`), so after editing API routes run `pnpm typecheck` from the repo root rather than `tsc --noEmit` inside `apps/web`
- **CI migration check:** CI runs `pnpm db:generate` and fails if `apps/api/drizzle` becomes dirty; always commit generated migrations with `*.table.ts` changes
- **CSP and imports:** Production CSP blocks runtime inline `<style>` tags (`apps/web/content-security-policy.ts`); local imports use `.ts`/`.tsx` extensions except generated `components/ui/*` and `routeTree.gen`

## Adding a feature

1. Contract: `<noun>.schema.ts` (zod schemas and inferred types)
2. Table and migration: `<noun>.table.ts`, re-exported from `db/schema.ts`, add any Drizzle relations in `apps/api/src/db/relations.ts`, then `pnpm db:generate`
3. Data access: `<noun>.repo.ts`
4. Logic: `<noun>.service.ts` and `<noun>.errors.ts`
5. Transport: `<noun>.routes.ts`, mounted in `app.ts`
6. Tests: `<noun>.test.ts`, including a 404 for another household on every route
7. Live updates, for data other people or devices see: add the topic to `apps/api/src/features/live/live-topics.ts` and call `announce()` from the service after each write. `pnpm check` then fails in the web app until the next two steps are done
8. Web: `<noun>.api.ts`, `<noun>.queries.ts` (query keys start with the area's name), `<noun>.changes.ts`, `<noun>.hooks.ts`, then components. Add the area to `AREAS` and `AREA_NAMES` in `lib/offline-changes.ts`, register its changes in `registerAllChanges` in `router.tsx`, and add its `components/*.tsx` glob to the area-components override in `.oxlintrc.json`
9. Route file under `routes/`, area colour tokens in `styles/globals.css` and `lib/theme.ts`, a nav entry in `components/layout/HouseholdShell.tsx`, and the area's dock add control in `routes/_household.tsx`
10. Add the feature to the Features list above, then run `pnpm check` and `pnpm test <noun>`
