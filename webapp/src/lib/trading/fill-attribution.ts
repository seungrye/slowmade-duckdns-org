/**
 * 체결 → 블록 귀속 — 순수 (#372).
 *
 * close-sync 는 **계좌 전체 체결내역**을 받는다(미장은 `usExecutionsAll` 로 전 거래소 일괄).
 * 그런데 close-sync 는 블록마다 따로 돌면서 그 체결을 전부 **자기 전략으로** 태깅했다.
 * `$setOnInsert` 라 먼저 도는 블록이 선점한다 — 블록이 하나였을 땐 안 드러났고,
 * 미국 계좌에 VR 이 붙자(#366) 첫날부터 틀렸다:
 *
 *   2026-09-01 SOXL 64주 매수
 *     tradingorderlogs(실제 주문 주체) → value_rebalancing
 *     stocktrades(기록)               → infinite_v4   ← 틀림
 *
 * 그래서 종목의 **주인이 정확히 하나일 때만** 귀속한다. 0개(어느 블록도 안 무는 옛 기록)나
 * 2개 이상(겹침)이면 태그 없이 계좌에 남긴다 — 모르면 지어내지 않는다.
 */
import { blockSymbols } from "./block-symbols";

export type AttributionBlock = {
  id: string;
  strategy: string;
  config: Record<string, unknown>;
  /**
   * 이 블록이 생긴 날 (YYYY-MM-DD). **그 전의 체결은 이 블록 것이 아니다.**
   *
   * close-sync 는 90일치 체결을 다시 훑는다(`LOOKBACK_DAYS`). 날짜를 안 보면 2026-09-01 에
   * 생긴 VR(SOXL) 블록이 **7월 rotation_v1 의 SOXL 매매**를, 07-17 에 생긴 v4(TQQQ) 블록이
   * **6월 trend_v1 의 TQQQ 매매**를 자기 것으로 끌어간다. 비우면 날짜를 안 따진다.
   */
  since?: string;
};

export type FillOwner = { id: string; strategy: string };

type Claim = FillOwner & { since?: string };

/**
 * (종목, 체결일) → 주인 블록을 찾아주는 함수를 만든다(블록 목록을 한 번만 훑는다).
 * 그날 그 종목을 무는 블록이 없거나 둘 이상이면 null.
 *
 * `recordedStrategy` 는 **이미 기록된 매매**를 되짚을 때만 준다(교정 스크립트). 블록 문서의
 * `createdAt` 은 그 전략이 돌기 시작한 날이 아니라 **문서를 쓴 날**이다 — 국장 069500 은
 * v1 에서 v4 로 편입돼 매매가 6/29 부터 있는데 블록 문서는 7/12 다. 이미 붙어 있는 전략이
 * 생성일보다 강한 증거이므로, 날짜로 못 가릴 때 전략으로 한 번 더 가린다.
 */
export function ownerLookup(
  blocks: AttributionBlock[],
): (ticker: string, date: string, recordedStrategy?: string,
    side?: "buy" | "sell") => FillOwner | null {
  const claims = new Map<string, Claim[]>();
  for (const b of blocks) {
    for (const sym of blockSymbols(b.config) ?? []) {
      const list = claims.get(sym) ?? claims.set(sym, []).get(sym)!;
      // 같은 블록이 같은 종목을 두 번 적어 뒀다고 겹침으로 치지 않는다.
      if (!list.some((o) => o.id === b.id)) {
        list.push({ id: b.id, strategy: b.strategy, ...(b.since ? { since: b.since } : {}) });
      }
    }
  }
  const 벗기기 = (c: Claim): FillOwner => ({ id: c.id, strategy: c.strategy });
  return (ticker: string, date: string, recordedStrategy?: string,
          side?: "buy" | "sell") => {
    const all = claims.get(ticker) ?? [];
    const live = all.filter((c) => !c.since || date >= c.since);
    if (live.length === 1) {
      // **블록이 생긴 날의 매도는 앞 전략의 청산일 수 있다** (#505).
      //
      // `since` 판정이 `date >= since`(생성 당일 포함)라, 옛 전략의 마지막 청산이 새 블록
      // 생성 당일에 걸리면 새 블록 것이 됐다. 실제로 그랬다 — TQQQ 2026-07-17 sell 4 는
      // 기록이 trend_v1 인데 그날 생긴 v4 블록에 귀속됐고, 대응 매수 3건은 무주라
      // 손익 −42.06 이 매수·매도로 갈려 사라졌다(3개월간 조용히).
      //
      // ⚠ "기록 전략이 다르면 무조건 거부" 로는 못 고친다. 바로 아래 케이스와 **구조가 같고
      //   원하는 결과가 반대**이기 때문이다:
      //     SOXL 2026-09-01 · 기록 infinite_v4(잘못) · VR 블록 since 09-01 → VR 이 가져가야 한다
      //     TQQQ 2026-07-17 · 기록 trend_v1(맞음)   · v4 블록 since 07-17 → v4 가 가져가면 안 된다
      //   구분자는 **방향**이다. 블록의 첫날 **매수**는 그 블록의 진입이고(VR 시드),
      //   첫날 **매도**는 들고 있지도 않던 물량의 청산이다.
      //
      // 그래서 조건을 최대한 좁힌다 — 생성 당일 && 매도 && 기록 전략이 다름. 실측으로
      // 운영 데이터 300건 중 이 조건에 걸리는 행은 문제의 1건뿐이다.
      if (side === "sell" && recordedStrategy
          && live[0].since === date && live[0].strategy !== recordedStrategy) {
        return null;
      }
      return 벗기기(live[0]);
    }
    if (recordedStrategy) {
      const 같은전략 = all.filter((c) => c.strategy === recordedStrategy);
      if (같은전략.length === 1) return 벗기기(같은전략[0]);
    }
    return null;
  };
}

/**
 * 지금 시점에 종목을 무는 블록이 둘 이상인 것들. 로그로 드러내 조용히 계좌 귀속되지 않게 한다.
 * (생성일이 서로 다른 블록은 기간이 겹치는지까지 따지지 않는다 — 경고용이라 넓게 잡는다.)
 */
export function contestedSymbols(blocks: AttributionBlock[]): string[] {
  const count = new Map<string, Set<string>>();
  for (const b of blocks) {
    for (const sym of blockSymbols(b.config) ?? []) {
      (count.get(sym) ?? count.set(sym, new Set()).get(sym)!).add(b.id);
    }
  }
  return [...count.entries()].filter(([, ids]) => ids.size > 1).map(([sym]) => sym).sort();
}
