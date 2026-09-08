import { defineConfig } from "vitest/config";

// The game engine (main.js) is a DOM-coupled IIFE, so it is integration-tested under jsdom.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.js"],
  },
});
