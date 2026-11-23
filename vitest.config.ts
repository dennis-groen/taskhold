import { defineConfig } from "vitest/config";

// Cross-package repository invariant checks; run in Node without Postgres
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
