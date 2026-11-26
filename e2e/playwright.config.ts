import { defineConfig, devices } from "@playwright/test";

// The browser test runs against the Docker image as it ships. Locally Playwright builds and starts
// it on port 3100 (serve-image.sh, next to this file) and stops it afterwards. CI starts the image
// itself and sets E2E_BASE_URL, which skips that; so does pointing E2E_BASE_URL anywhere else.
// The config lives in e2e/ so the folder's tsconfig covers it (pnpm test:e2e passes --config).
const baseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: ".",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: baseURL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  // Phone-first, so a phone-sized Chromium
  projects: [{ name: "phone", use: devices["Pixel 7"] }],
  ...(!baseURL && {
    webServer: {
      command: "./serve-image.sh",
      url: "http://localhost:3100/api/health",
      // The image builds first; a cached build takes seconds, a cold one a few minutes
      timeout: 300_000,
      stdout: "ignore",
      stderr: "pipe",
      // Lets docker run pass the signal on, so the container stops and is removed with the test
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
  }),
});
