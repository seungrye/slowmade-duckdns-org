/**
 * 매매 차트 탭 목록 — **순수** (#515).
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 *
 * 탭이 **살아있는 포트폴리오** 에서만 만들어지고 있었다(`listEnvCurrencies`). 그래서 블록을
 * 다른 계좌로 옮기면 옛 계좌 탭이 통째로 사라진다 — 기록은 DB 에 그대로 있는데 볼 방법이
 * 없어진다. 실측(2026-09-30): `paper-50194613` 에 매매기록 300건·이력 275건이 있는데,
 * 블록 3개를 새 계좌로 옮기면 그게 화면에서 없어진다.
 *
 * 바로 옆에 `listEnvs()` 가 데이터에서 env 를 뽑고 있었지만 아무도 안 썼다(죽은 코드).
 * 두 소스를 합치는 게 맞다:
 *
 *   살아있는 블록  → 매매 전이어도 탭이 보인다(만들자마자 확인할 수 있어야 한다)
 *   기록이 있는 조합 → 블록이 떠났어도 **보관** 탭으로 남는다
 *
 * 순서는 살아있는 것 먼저다 — 지금 돌고 있는 것을 먼저 본다.
 */

export type TabCurrency = "KRW" | "USD";
export type Tab = { env: string; currency: TabCurrency; archived: boolean };

const keyOf = (t: { env: string; currency: TabCurrency }) => `${t.env}|${t.currency}`;

/** env → 통화 순, 안정 정렬. 탭 순서가 새로고침마다 바뀌면 안 된다. */
const byEnvThenCurrency = (a: Tab, b: Tab) =>
  a.env === b.env ? (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0)
    : a.env < b.env ? -1 : 1;

/**
 * 살아있는 블록의 조합과 기록이 있는 조합을 합친다. 순수(불변).
 *
 * 양쪽에 있으면 **살아있는 쪽이 이긴다**(`archived: false`) — 보관 표시가 잘못 붙으면
 * 지금 돌고 있는 계좌를 끝난 것으로 읽는다.
 */
export function buildTabs(
  live: { env: string; currency: TabCurrency }[],
  withData: { env: string; currency: TabCurrency }[],
): Tab[] {
  const liveKeys = new Set(live.map(keyOf));

  const liveTabs = dedupe(live).map((t) => ({ ...t, archived: false }));
  const archivedTabs = dedupe(withData)
    .filter((t) => !liveKeys.has(keyOf(t)))
    .map((t) => ({ ...t, archived: true }));

  return [
    ...liveTabs.sort(byEnvThenCurrency),
    ...archivedTabs.sort(byEnvThenCurrency),
  ];
}

function dedupe(xs: { env: string; currency: TabCurrency }[]): { env: string; currency: TabCurrency }[] {
  const seen = new Set<string>();
  const out: { env: string; currency: TabCurrency }[] = [];
  for (const x of xs) {
    const k = keyOf(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ env: x.env, currency: x.currency });
  }
  return out;
}
