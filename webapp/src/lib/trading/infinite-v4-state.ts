// 무한매수 V4.0 실운영 상태 + 전일 체결 대사 — 파이썬 trading/infinite_v4_state.py 포팅.
// 순수 로직(브로커·DB 를 모른다). 상태는 TradingPortfolio.state.v4 에 영속(파일 대체).
// 테스트: infinite-v4-state.test.ts (파이썬 tests/test_infinite_v4_state.py 와 같은 벡터).

export type V4Pending = {
  one: number; // 전일 1회매수금(잔금/(분할−T))
  q25: number; // ¼ 별지점 LOC 매도 수량
  q75: number; // ¾ +목표% 지정가 매도 수량
  reverseSell: number;
  reverseFirst: boolean;
};

export type V4State = {
  symbol: string;
  splits: number;
  cycleCash: number; // 종목 전용 장부 현금(복리) — 실제 계좌 현금과 분리
  t: number;
  mode: "normal" | "reverse";
  entryLimit: number; // 첫 매수 LOC(전일종가×1.10). 0=미설정
  reverseFirstDay: boolean;
  recoverConfirmed: boolean;
  lastRunDate: string; // YYYYMMDD — 이 날짜 이후 체결을 대사
  pending: V4Pending;
};

export const emptyPending = (): V4Pending => ({
  one: 0, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false,
});

export function newV4State(symbol: string, splits: number, principal: number): V4State {
  return {
    symbol, splits, cycleCash: principal, t: 0, mode: "normal",
    entryLimit: 0, reverseFirstDay: false, recoverConfirmed: false,
    lastRunDate: "", pending: emptyPending(),
  };
}

/** 유휴현금(입금) 흡수 — 현금 드래그 제거. 포지션이 **플랫(holding===0)** 일 때만, 계좌 가용현금이
 *  사이클 장부(cycleCash)보다 크면 cycleCash 를 계좌현금으로 재시드한다(사이클 경계/최초 진입 전).
 *  플랫 시점엔 포지션이 없어 계좌현금=이 종목의 가용 드라이파우더이므로 이중반영·상한위반 없이 안전.
 *  보유 중(holding>0)엔 손대지 않음(진행 사이클의 분할 스케줄 보호). enabled=false 면 무변경. 순수(불변). */
export function absorbIdleCash(state: V4State, accountCash: number, holding: number, enabled: boolean): V4State {
  if (enabled && holding === 0 && Number.isFinite(accountCash) && accountCash > state.cycleCash) {
    return { ...state, cycleCash: accountCash };
  }
  return state;
}

export type V4Fill = { side: "buy" | "sell"; qty: number; price: number };

/** 하루치 체결을 상태에 적용(순수 — 원본 불변). holdingAfter: 그 날 이후 보유수량 근사. */
export function reconcileDay(state: V4State, fills: V4Fill[], holdingAfter: number): V4State {
  const s: V4State = { ...state, pending: { ...state.pending } };
  const pend = state.pending;
  const buys = fills.filter((f) => f.side === "buy");
  const sells = fills.filter((f) => f.side === "sell");
  const buyAmt = buys.reduce((a, f) => a + f.qty * f.price, 0);
  const sellAmt = sells.reduce((a, f) => a + f.qty * f.price, 0);
  s.cycleCash += sellAmt - buyAmt;

  if (s.mode === "reverse") {
    const decay = s.splits === 20 ? 0.9 : 0.95;
    if (sells.length) s.t *= decay;
    if (buys.length) s.t += (s.splits - s.t) * 0.25;
    s.reverseFirstDay = false;
  } else {
    const soldQty = sells.reduce((a, f) => a + f.qty, 0);
    if (soldQty > 0 && holdingAfter <= 0) {
      // 전량 소진 → 사이클 종료(복리 리셋). 같은 날 재진입 체결이 있으면 1회차로.
      s.t = buyAmt > 0 ? 1.0 : 0.0;
      s.mode = "normal";
      s.entryLimit = 0;
      s.pending = emptyPending();
      return s;
    }
    if (soldQty > 0) {
      // 매도 종류 판별 — q75(지정가)면 ×0.25, q25(쿼터 LOC)면 ×0.75. 모호하면 T 유지.
      if (pend.q75 && soldQty >= pend.q75) s.t *= 0.25;
      else if (pend.q25 && soldQty >= pend.q25) s.t *= 0.75;
    }
    if (buyAmt > 0) {
      if (s.t === 0 && s.entryLimit) {
        s.t = 1.0;
        s.entryLimit = 0;
      } else if (pend.one > 0) {
        s.t += buyAmt / pend.one;
      }
    }
    if (s.t > s.splits - 1) {
      s.mode = "reverse";
      s.reverseFirstDay = true;
    }
  }
  s.pending = emptyPending();
  return s;
}
