import { defineConfig } from "vite";

// Capacitor WebView 는 file:// 로 로드하므로 상대 경로(base './') 가 필수.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", assetsDir: "assets", emptyOutDir: true },
});
