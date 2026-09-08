import { defineConfig } from "vite";

// The Capacitor WebView loads over file://, so a relative path (base './') is essential.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", assetsDir: "assets", emptyOutDir: true },
});
