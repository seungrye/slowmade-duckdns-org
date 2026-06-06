// 시드 idempotency 별도 config — child_process 로 seeds-replay 실행.
// 일반 vitest 와 격리되어야 mongoose model race 차단.

import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    globals: true,
    environment: "node",
    include: ["src/lib/web-adventure/__tests__/seed-idempotency.test.ts"],
    testTimeout: 120000,
  },
});
