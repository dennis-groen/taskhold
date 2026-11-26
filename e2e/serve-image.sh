#!/bin/sh
# Builds the Docker image and runs it on port 3100 the way CI does, for `pnpm test:e2e`: on an
# empty database it migrates itself, the API serves the web build, and the demo is on. Playwright
# starts this (playwright.config.ts) and stops it when the test ends. Needs Postgres: `pnpm db:up`.
set -eu
cd "$(dirname "$0")/.."

# A fresh database every run, as in CI: demos left over would count against the per-address limit
docker compose exec -T postgres dropdb --username taskhold --if-exists --force taskhold_e2e
docker compose exec -T postgres createdb --username taskhold taskhold_e2e
docker rm --force taskhold-e2e > /dev/null 2>&1 || true
docker build --quiet --tag taskhold:e2e . > /dev/null

# Throwaway values for what the demo doesn't use
exec docker run --rm --name taskhold-e2e --publish 127.0.0.1:3100:3000 \
  --add-host host.docker.internal:host-gateway \
  --env DATABASE_URL=postgres://taskhold:taskhold@host.docker.internal:5432/taskhold_e2e \
  --env BETTER_AUTH_URL=http://localhost:3100 \
  --env BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  --env GOOGLE_CLIENT_ID=unused \
  --env GOOGLE_CLIENT_SECRET=unused \
  --env DEMO_MODE=true \
  --env LOG_LEVEL=warn \
  taskhold:e2e
