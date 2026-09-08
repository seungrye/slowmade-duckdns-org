import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // #281 - handling `next lint`'s deprecation (Next 16). Build output and dependencies are excluded.
  {
    ignores: [
      ".next/**",
      ".next-3010/**",
      ".next-3011/**",
      ".next-tmp/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "scripts/backups/**",
      // The downloaded EmulatorJS itself - someone else's code, and minified (#148).
      // Only the public/games/retro/*.js we wrote are checked.
      "public/games/retro/data/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  // The player modules that run in the browser as they are (#148).
  //
  // They are served straight from `public/` without passing through a bundler. While they lived as **inline scripts**
  // in player.html, neither eslint nor tsc looked at them, and a call to an undefined function shipped
  // (`romFileName is not defined` - patch and split-set merging died entirely).
  // Splitting them into files and turning `no-undef` on catches that class of bug here.
  {
    files: ["public/games/retro/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: Object.fromEntries(
        [
          "window", "document", "location", "console", "fetch", "Response", "Request",
          "URL", "URLSearchParams", "FormData", "Blob", "File", "TextEncoder", "TextDecoder",
          "CompressionStream", "DecompressionStream", "setTimeout", "clearTimeout",
        ].map((k) => [k, "readonly"]),
      ),
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
