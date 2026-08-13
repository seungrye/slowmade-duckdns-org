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
      // 내려받은 EmulatorJS 본체 — 남의 코드이고 minified 다 (#148).
      // 우리가 쓴 public/games/retro/*.js 만 검사한다.
      "public/games/retro/data/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  // 브라우저에서 그대로 도는 플레이어 모듈 (#148).
  //
  // 번들러를 거치지 않고 `public/` 에서 바로 서빙된다. player.html 의 **인라인 스크립트**로
  // 있던 동안에는 eslint 도 tsc 도 보지 않아서, 정의조차 없는 함수를 부르는 채로 배포됐다
  // (`romFileName is not defined` — 패치·분할셋 병합이 통째로 죽었다).
  // 파일로 떼어 내고 `no-undef` 를 켜 그 부류를 여기서 잡는다.
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
