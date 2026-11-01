import { defineConfig } from "vitest/config";

// Tests run the Hono app in-process (app.request) against a separate database, so they never
// touch dev data. Point TEST_DATABASE_URL elsewhere in CI.
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://taskhold:taskhold@localhost:5432/taskhold_test";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Set before any app module loads, so config/env.ts validates these instead of .env
    env: {
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: "http://localhost:5173",
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      LOG_LEVEL: "silent",
      LOG_FORMAT: "json",
    },
  },
});
