# e2e — Playwright 실 브라우저 통합 (#277)

`src/**/*.test.tsx` (RTL/jsdom) 과 별개로, 실제 chromium 위에서 SSR + 클라이언트
hydration + 사용자 인터랙션을 *그대로* 검증한다.

## 무엇을 여기서 덮나 (#425)

**화면 없이는 못 재는 것만** 여기서 덮는다. 나머지는 더 싸고 빠른 곳에 둔다.

| 종류 | 어디서 | 왜 |
|---|---|---|
| 순수 규칙 (침식·판정·엔딩·상태 전이) | `vitest` (`lib/**/*.test.ts`) | 브라우저가 필요 없다. 밀리초 단위로 돈다 |
| 계산 (레이아웃 수식·기하) | `vitest` (`_components/*.test.ts`) | 입력을 폭넓게 훑을 수 있다 — 폭 6종 × 장수 7종 같은 격자 |
| 컴포넌트 렌더·접근성 이름 | `vitest` + RTL (jsdom) | DOM 만 있으면 된다 |
| **제스처** (끌기·튕기기·훑기·포인터 캡처) | **e2e** | jsdom 에 포인터 이벤트도 시간도 없다 |
| **배치** (넘침·가려짐·스크롤·뷰포트 높이) | **e2e** | jsdom 은 모든 것을 0×0 으로 잰다 |
| **포커스·키보드 동선**, 스크롤 위치 | **e2e** | 실제 렌더 트리와 브라우저 기본동작이 필요하다 |

기준은 하나다 — **jsdom 이 거짓말하는 것**이면 e2e. 레이아웃(`getBoundingClientRect`),
시간(포인터 속도), 겹침(hit-test)이 그렇다.

새 UI 동작을 만들면 위 오른쪽 세 줄에 해당하는 부분을 e2e 로 같이 남긴다. 손짓은
`helpers/pointer-gesture.ts` 를 쓴다 — Playwright 의 mouse API 로는 플릭 속도가 안 나온다
(호출마다 왕복 지연이 붙어 40px 옮기는 데 200ms 넘게 걸린다). 헬퍼가 페이지 안에서
`setTimeout` 간격으로 이벤트를 낸다.

> **dev 서버로는 못 돈다.** 사이트 CSP 가 `unsafe-eval` 을 막는데 `next dev` 의 HMR 이
> eval 을 쓴다 → 하이드레이션이 죽고 **버튼이 아무 반응도 안 한다.** 기능이 깨진 것처럼
> 보이지만 아니다. 반드시 프로덕션 빌드를 띄우고 검사한다(아래 "실행").

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
