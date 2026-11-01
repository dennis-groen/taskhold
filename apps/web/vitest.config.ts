import path from "node:path";

import { defineConfig } from "vitest/config";

// Unit tests for the web app's pure logic; they run in Node, which has Temporal built in
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
