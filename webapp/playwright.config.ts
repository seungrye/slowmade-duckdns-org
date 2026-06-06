// Playwright config — #277 실 브라우저 통합 e2e.
//
// 운영 환경:
//   - PLAYWRIGHT_BASE_URL 으로 운영 중인 dev/prod 서버 주소 주입.
//     기본값: http://localhost:3010 (Blue 슬롯).
//   - mongo 가 켜진 상태여야 web-adventure content fetch 성공.
//
// 실행:
//   PLAYWRIGHT_BASE_URL=http://localhost:3010 npx playwright test
//   PLAYWRIGHT_BASE_URL=https://slowmade.duckdns.org npx playwright test
//
// CI 의도 — 본 설정은 *로컬 검증* 위주. CI 자동화는 별도 워크플로.

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
