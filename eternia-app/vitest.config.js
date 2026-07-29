import { defineConfig } from "vitest/config";

// 게임 엔진(main.js)이 DOM 결합 IIFE라 jsdom 환경에서 통합 테스트.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.js"],
  },
});
