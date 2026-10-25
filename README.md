# taskhold

pnpm monorepo with a Hono API and a Vite + React + TypeScript frontend (React Compiler enabled).

```
apps/
  api/   Hono on Node (@hono/node-server), port 3000, routes under /api
  web/   Vite + React 19 + React Compiler, port 5173, proxies /api to the API
packages/  shared packages (empty for now)
```

## Getting started

Requires Node 24+ and pnpm 12.

```bash
pnpm install
pnpm dev          # runs api and web in parallel
```

Open http://localhost:5173.

## Scripts

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Start both apps in watch mode         |
| `pnpm dev:api`   | Start only the API                    |
| `pnpm dev:web`   | Start only the frontend               |
| `pnpm build`     | Build all apps                        |
| `pnpm typecheck` | Typecheck all apps                    |
| `pnpm lint`      | Lint (oxlint in `apps/web`)           |
