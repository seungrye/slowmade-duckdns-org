import { describe, expect, it } from "vitest";
import {
  absorbIdleCash, emptyPending, mergePending, newV4State, reconcileDay, type V4State,
} from "./infinite-v4-state";
import { cyclesFor } from "./scheduler";

// 파이썬 tests/test_infinite_v4_state.py 와 동일 벡터 — 포팅 일치 확인.

function st(over: Partial<V4State> = {}): V4State {
  return { ...newV4State("TQQQ", 20, 10_000), t: 5, ...over };
}

// 흡수 상한 = max(principal, cycleCash). 아래 st() 는 원금 10,000 로 만들어지므로
// 상한을 넘겨 보려면 principal 을 명시해서 부른다.
describe("infinite-v4-state.absorbIdleCash — 유휴현금(입금) 흡수", () => {
  it("플랫(holding 0) + 계좌현금 > cycleCash → cycleCash 재시드(입금 흡수)", () => {
    const s = st({ cycleCash: 3900 });
    const out = absorbIdleCash(s, 4900, 0, true, 10_000); // $1000 입금(원금 이내)
    expect(out.cycleCash).toBe(4900);
    expect(s.cycleCash).toBe(3900); // 원본 불변
  });
  it("보유 중(holding>0)이면 흡수 안 함(진행 사이클 보호)", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 4900, 10, true, 10_000);
    expect(out.cycleCash).toBe(3900);
  });
  it("계좌현금이 cycleCash 이하면 무변경(미정산 감소 무시)", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 3000, 0, true, 10_000);
    expect(out.cycleCash).toBe(3900);
  });
  it("enabled=false 면 무변경", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 9999, 0, false, 10_000);
    expect(out.cycleCash).toBe(3900);
  });

  // #485 — 상한이 없으면 사이클 경계에서 계좌 현금 전액이 원금이 됐다.
  it("계좌에 원금보다 많은 돈이 있어도 원금까지만 흡수한다", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 50_000, 0, true, 10_000);
    expect(out.cycleCash).toBe(10_000); // 계좌 5만이어도 원금 1만까지
  });
  it("복리로 장부가 원금을 넘었으면 장부가 상한 — 계좌에 더 있어도 무변경", () => {
    const out = absorbIdleCash(st({ cycleCash: 12_000 }), 50_000, 0, true, 10_000);
    expect(out.cycleCash).toBe(12_000); // 제 힘으로 불린 몫은 지키고, 남의 돈은 안 집는다
  });
  it("계좌현금이 원금보다 적으면 계좌현금까지만(없는 돈을 있다고 하지 않는다)", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 6000, 0, true, 10_000);
    expect(out.cycleCash).toBe(6000);
  });
});

// #483 — 국장 v4 는 하루가 sell(09:30)/buy(15:20) 두 사이클이라, phase 마다 pending 을
// 새로 만들어 통째로 저장하면 나중에 도는 buy 가 sell 의 q75 를 0 으로 덮었다.
describe("infinite-v4-state.mergePending — phase 로 나뉜 하루의 예약 합치기", () => {
  const prev = { ...emptyPending(), one: 500, q75: 24, reverseFirst: true };
  const next = { ...emptyPending(), one: 500, q25: 8, reverseSell: 3 };

  it("buy phase 는 앞 phase 의 q75·reverseFirst 를 이어받는다", () => {
    const out = mergePending(prev, next, "buy");
    expect(out.q75).toBe(24);
    expect(out.reverseFirst).toBe(true);
    expect(out.q25).toBe(8); // 자기가 만든 칸은 그대로
    expect(out.reverseSell).toBe(3);
  });
  it("sell phase 는 하루의 시작이라 이어받지 않는다", () => {
    const out = mergePending(prev, { ...emptyPending(), q75: 24 }, "sell");
    expect(out).toEqual({ ...emptyPending(), q75: 24 });
  });
  it("both(미장)는 한 사이클에서 다 적으므로 그대로", () => {
    const full = { ...emptyPending(), one: 9, q25: 2, q75: 6 };
    expect(mergePending(prev, full, "both")).toEqual(full);
  });
  it("원본 불변(순수)", () => {
    mergePending(prev, next, "buy");
    expect(next.q75).toBe(0);
    expect(prev.q25).toBe(0);
  });
});

describe("infinite-v4-state.reconcileDay — 파이썬 벡터", () => {
  it("¾ 지정가(q75) 체결 → T×0.25, 잔여 보유 → 사이클 유지", () => {
    const s = st({ pending: { ...emptyPending(), one: 500, q25: 2, q75: 6 } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 6, price: 115 }], 2);
    expect(s2.t).toBeCloseTo(1.25);
    expect(s2.cycleCash).toBe(10_000 + 6 * 115);
  });

  // #483 이 왜 위험한지 못박아 두는 특성 테스트 — 대사는 "수량" 으로 매도 종류를 가리므로
  // q75 예약이 0 이면 ¾ 체결(6주)이 q25 조건(6 >= 2)에 먼저 걸려 ×0.75 가 된다.
  // 정답은 위 테스트의 1.25 다. mergePending 이 q75 를 살려야 이 경로로 안 빠진다.
  it("q75 예약이 지워지면 ¾ 체결이 q25 분기로 잘못 빠진다(수량만으로는 못 가린다)", () => {
    const s = st({ pending: { ...emptyPending(), one: 500, q25: 2, q75: 0 } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 6, price: 115 }], 2);
    expect(s2.t).toBeCloseTo(3.75); // 1.25 여야 할 자리 — 예약을 잃으면 이렇게 된다
  });

  it("쿼터(q25) 체결 → T×0.75", () => {
    const s = st({ pending: { ...emptyPending(), one: 500, q25: 2, q75: 6 } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 2, price: 108 }], 6);
    expect(s2.t).toBeCloseTo(3.75);
  });

  it("전량 소진 → 리셋(복리 — 매도대금 반영)", () => {
    const s = st({ pending: { ...emptyPending(), one: 500, q25: 2, q75: 6 } });
    const s2 = reconcileDay(s, [
      { side: "sell", qty: 6, price: 115 }, { side: "sell", qty: 2, price: 112 },
    ], 0);
    expect(s2.t).toBe(0);
    expect(s2.mode).toBe("normal");
    expect(s2.cycleCash).toBe(10_000 + 6 * 115 + 2 * 112);
  });

  it("매수 체결 250(=one 절반) → T += 0.5", () => {
    const s = st({ pending: { ...emptyPending(), one: 500 } });
    const s2 = reconcileDay(s, [{ side: "buy", qty: 5, price: 50 }], 10);
    expect(s2.t).toBeCloseTo(5.5);
    expect(s2.cycleCash).toBe(10_000 - 250);
  });

  it("진입 체결 → T=1, entryLimit 해제", () => {
    const s = st({ t: 0, entryLimit: 110 });
    const s2 = reconcileDay(s, [{ side: "buy", qty: 9, price: 100 }], 9);
    expect(s2.t).toBe(1);
    expect(s2.entryLimit).toBe(0);
  });

  it("T 소진(>splits−1) → 리버스 예약(첫날 플래그)", () => {
    const s = st({ t: 18.8, pending: { ...emptyPending(), one: 500 } });
    const s2 = reconcileDay(s, [{ side: "buy", qty: 4, price: 50 }], 100);
    expect(s2.t).toBeGreaterThan(19);
    expect(s2.mode).toBe("reverse");
    expect(s2.reverseFirstDay).toBe(true);
  });

  it("리버스: 매도 → T×0.9(20분할), 매수 → T += (분할−T)×0.25", () => {
    const s = st({ mode: "reverse", t: 19.5, pending: { ...emptyPending(), reverseSell: 10 } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 10, price: 50 }], 90);
    expect(s2.t).toBeCloseTo(19.5 * 0.9);
    const s3 = reconcileDay(s2, [{ side: "buy", qty: 5, price: 40 }], 95);
    expect(s3.t).toBeCloseTo(s2.t + (20 - s2.t) * 0.25);
  });

  it("원본 불변(순수)", () => {
    const s = st({ pending: { ...emptyPending(), one: 500, q75: 6 } });
    reconcileDay(s, [{ side: "sell", qty: 6, price: 115 }], 2);
    expect(s.t).toBe(5);
    expect(s.cycleCash).toBe(10_000);
  });
});

describe("scheduler.cyclesFor — 매매 phase + 마감 sync 사이클", () => {
  const close = { phase: "close", at: "16:10" }; // 모든 포트폴리오 공통(체결확인·차트·메일)
  it("국장 v4 = 매도(runAt) + 매수(15:20) + 마감", () => {
    expect(cyclesFor({ strategy: "infinite_v4", market: "kr", runAt: "09:30" })).toEqual([
      { phase: "sell", at: "09:30" }, { phase: "buy", at: "15:20" }, close,
    ]);
  });
  it("미장 v4 = both(실제 LOC) + 마감", () => {
    expect(cyclesFor({ strategy: "infinite_v4", market: "us", runAt: "09:35" })).toEqual([
      { phase: "both", at: "09:35" }, close,
    ]);
  });
  it("그 외 전략 = main + 마감", () => {
    expect(cyclesFor({ strategy: "lrs_v1", market: "us", runAt: "09:35" })).toEqual([
      { phase: "main", at: "09:35" }, close,
    ]);
  });
});
