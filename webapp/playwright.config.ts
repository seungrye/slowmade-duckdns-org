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
  // CI 에서는 JSON 을 함께 낸다 (#445).
  //
  // `retries: 2` 는 flake 를 **조용히 삼킨다** — 재시도에 통과하면 잡이 초록이고 아무도
  // 모른다. #443 작업 중 손패 제스처 시험이 로컬 병렬에서 간헐 실패했는데, CI 였다면 그냥
  // 초록이었을 것이다. JSON 을 남기면 워크플로가 "재시도로 통과한 시험"을 세어 경고로
  // 띄울 수 있다 — **실패로 만들지는 않는다.** 그러면 아무도 안 고치고 재시도를 꺼 버린다.
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: "playwright-report/results.json" }]]
    : "list",
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
