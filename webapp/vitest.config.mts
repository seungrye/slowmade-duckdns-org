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
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
