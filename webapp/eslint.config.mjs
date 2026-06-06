import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // #281 — `next lint` deprecation (Next 16) 대응. 빌드 산출물 / 의존성 제외.
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
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
