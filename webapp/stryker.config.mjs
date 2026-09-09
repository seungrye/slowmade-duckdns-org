// 변이 시험 (#445) — **시험이 정말 실패할 수 있는지** 검사한다.
//
// 커버리지는 "그 줄이 실행됐나"만 본다. 실행됐는데 결과를 단언하지 않으면 초록으로 남는다.
// 변이 시험은 코드를 일부러 틀리게 바꿔 보고(`>` → `>=`, `+` → `-`, 조건 뒤집기) **시험이
// 그것을 잡는지** 본다. 못 잡는 변이(살아남은 변이)가 곧 단언이 빈 자리다.
//
// 왜 이걸 넣었나: #443 에서 e2e 하나가 **틀린 통과**를 했다. 조상 선택자가 엉뚱한 요소를
// 재서 폭 단언이 그냥 통과했다. 그 전에도 탭 시험이 안 깨지는 걸 손으로 변이를 넣어
// 발견했다 — 손으로 하면 기억할 때만 한다.
//
// ── 범위를 좁게 못박는다 ────────────────────────────────────────────
//
// 변이 시험의 유일한 실질적 문제는 **비용**이다(파일 하나에 변이가 수십 개, 각각 시험을
// 다시 돌린다). 그래서 `src/lib/eternia-refine` 만 본다:
//
//   - **순수하다** — 네트워크·DOM·시계가 없어 한 판이 밀리초다(206개 시험이 752ms).
//   - **규칙이 몰려 있다** — 침식·정제·엔딩·지도 판정. 여기가 틀리면 게임이 틀린다.
//
// 화면 코드는 일부러 뺐다. 느리고, 거기서 중요한 것(배치·제스처)은 변이가 아니라 실제
// 브라우저가 잡는다.
//
// ── 어떻게 돌리나 ──────────────────────────────────────────────────
//
//   pnpm test:mutation
//
// PR 마다 돌리지 않는다. 손으로, 그리고 주 1회 CI 가 돈다(.github/workflows/mutation.yml).
// 점수가 떨어졌다고 빌드를 깨지 않는다 — 살아남은 변이 목록을 **읽고** 단언을 보강하는
// 것이 목적이지 숫자를 지키는 것이 아니다. 다만 눈에 띄게 무너지면 알아야 하므로
// `break` 를 낮게 하나 걸어 둔다.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',

  // **명시해야 한다.** pnpm 은 node_modules 를 평탄화하지 않아 Stryker 의 플러그인 자동
  // 탐색이 러너를 못 찾는다("Cannot find TestRunner plugin \"vitest\"" — 실측).
  plugins: ['@stryker-mutator/vitest-runner'],

  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.mts' },

  // 순수 규칙만. 시험 파일 자체는 변이 대상이 아니다.
  //
  // **데이터와 바깥 경계는 뺀다.** 첫 실행에서 `content.ts` 가 29% 였는데, 살아남은 172 중
  // 122 가 카드·적 수치를 한 칸 옮긴 변이였다(`damage: 8` → `9`). 그걸 잡으려면 시험이
  // 콘텐츠 숫자를 그대로 베껴 적어야 하는데, 그건 밸런스를 만질 때마다 시험이 깨진다는
  // 뜻이라 **잡지 않는 게 맞다**. `scenes.ts` 는 fetch 한 겹이라 애초에 단위 시험 대상이
  // 아니다(실패는 조용히 null — 그 계약은 부르는 쪽에서 검증한다).
  //
  // 노이즈를 남겨 두면 보고서를 안 보게 된다. 그게 이 도구가 죽는 가장 흔한 방식이다.
  mutate: [
    'src/lib/eternia-refine/**/*.ts',
    '!src/lib/eternia-refine/**/*.test.ts',
    '!src/lib/eternia-refine/content.ts',
    '!src/lib/eternia-refine/scenes.ts',
  ],

  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },

  // 점수는 목표가 아니라 신호다. `high`/`low` 는 보고서 색깔일 뿐이고, `break` 만
  // 실패로 이어진다 — 크게 무너졌을 때만 걸리게 낮게 둔다.
  thresholds: { high: 85, low: 70, break: 60 },

  // 시간이 오래 걸리는 변이는 대개 무한루프를 만든 것이다. 기다리지 않는다.
  timeoutMS: 10_000,
  concurrency: 4,
};
