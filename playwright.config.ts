import { defineConfig, devices } from "@playwright/test";

// The browser test (e2e/) runs against an app that's already up, the Docker image as it ships:
// CI starts it, and docs/development.md shows how to locally. E2E_BASE_URL points it elsewhere.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  // Phone-first, so a phone-sized Chromium
  projects: [{ name: "phone", use: devices["Pixel 7"] }],
});
