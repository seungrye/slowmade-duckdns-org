import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // PostCSS / Tailwind v4 의 next/postcss 플러그인은 vite v8 의 옛 PostCSS
  // 검사기와 호환되지 않아 vitest 가 .css 를 통과시키지 못한다. 테스트는
  // 스타일을 검증하지 않으므로 PostCSS 자체를 비활성화 (`postcss: { plugins: [] }`).
  // (#222 — @xyflow/react/dist/style.css 임포트가 도입되며 노출됨.)
  css: {
    postcss: { plugins: [] },
  },
  test: {
    globals: true,
    environment: 'node',
    // 워커를 프로세스(forks) 대신 스레드로. 파일 288 개 중 절반 이상이 0.03 초짜리라
    // **파일당 부팅 비용이 전체를 지배**한다 — 실측 43s → 39s.
    // (seed-idempotency 는 child_process 를 쓰므로 vitest.seed.config.mts 로 분리돼 있고
    //  거기는 기본 forks 를 그대로 쓴다.)
    pool: 'threads',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      // #305 — seed-idempotency.test 는 child_process 로 seeds-replay 실행 → 동시 다른
      //   mongo 테스트와 race + OverwriteModelError. 별도 명령 (pnpm test:seed) 으로 분리.
      'src/lib/web-adventure/__tests__/seed-idempotency.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
