# One image for the whole app: the API, which also serves the web app's build, so both share
# one origin. Migrations run on start. Build with: docker build -t taskhold .

# The exact version in .node-version, pinned by digest so a moved tag can't change what ships.
# Dependabot proposes the next one (.github/dependabot.yml).
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
# Node 26 no longer ships Corepack; install the pnpm version package.json pins
RUN npm install --global pnpm@12.3.4
WORKDIR /repo

FROM base AS build
# Dependencies first, so editing source doesn't redo the install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# The API with only its production dependencies, ready to copy into the final image
RUN pnpm --filter @taskhold/api deploy --prod --legacy /deploy

FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_ROOT=/app/web
WORKDIR /app
COPY --from=build /deploy/package.json ./
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1
# Migrate, then replace the shell with the API so it receives SIGTERM directly
CMD ["sh", "-c", "node dist/db/migrate.js && exec node dist/index.js"]
