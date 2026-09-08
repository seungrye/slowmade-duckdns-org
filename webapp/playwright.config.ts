// The Playwright config - #277's real-browser integration e2e.
//
// The environment:
//   - PLAYWRIGHT_BASE_URL injects the address of a running dev or prod server.
//     Default: http://localhost:3010 (the Blue slot).
//   - mongo must be up for the web-adventure content fetch to succeed.
//
// Running it:
//   PLAYWRIGHT_BASE_URL=http://localhost:3010 npx playwright test
//   PLAYWRIGHT_BASE_URL=https://slowmade.duckdns.org npx playwright test
//
// The CI intent - this config is mainly for *local verification*. CI automation is a separate workflow.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3010",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
