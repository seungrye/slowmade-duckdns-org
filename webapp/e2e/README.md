# e2e — Playwright 실 브라우저 통합 (#277)

`src/**/*.test.tsx` (RTL/jsdom) 과 별개로, 실제 chromium 위에서 SSR + 클라이언트
hydration + 사용자 인터랙션을 *그대로* 검증한다.

## 설치 (1회)

```bash
pnpm e2e:install   # chromium 다운로드 (~500MB, ~/.cache/ms-playwright)
```

## 실행

```bash
# 1) 검증할 서버를 띄운다 (운영 슬롯 또는 임시 prod).
pnpm build && pnpm start                         # 3010 (default)
# 또는: PORT=3099 npx next start -p 3099 &

# 2) 그 base URL 로 Playwright 실행.
PLAYWRIGHT_BASE_URL=http://localhost:3010 pnpm e2e
```

`PLAYWRIGHT_BASE_URL` 미지정 시 `http://localhost:3010`.

## 시나리오

| 파일 | 검증 |
|---|---|
| `web-adventure.spec.ts` | CharacterCreator 마운트 / 주인공 선택 → playing / 분기 클릭 / 침식 가시 / /scenes/graph 범례 / 갤러리 6 카드 |

## 디버깅

```bash
PLAYWRIGHT_BASE_URL=... pnpm e2e --debug          # inspector
PLAYWRIGHT_BASE_URL=... pnpm e2e --headed         # headed chromium
pnpm e2e --ui                                      # Playwright UI
```

실패 시 `test-results/<spec>/test-failed-*.png` 스크린샷 + trace 자동 저장.

## CI

본 설정은 *로컬 검증* 위주. CI 자동화는 별도 workflow + `forbidOnly` /
`retries` 옵션은 `playwright.config.ts` 의 `process.env.CI` 분기로 제어.
