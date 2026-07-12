import { describe, expect, it } from "vitest";
import { emptyPending, newV4State, reconcileDay, type V4State } from "./infinite-v4-state";
import { cyclesFor } from "./scheduler";

// 파이썬 tests/test_infinite_v4_state.py 와 동일 벡터 — 포팅 일치 확인.

function st(over: Partial<V4State> = {}): V4State {
  return { ...newV4State("TQQQ", 20, 10_000), t: 5, ...over };
}

describe("infinite-v4-state.reconcileDay — 파이썬 벡터", () => {
  it("¾ 지정가(q75) 체결 → T×0.25, 잔여 보유 → 사이클 유지", () => {
    const s = st({ pending: { ...emptyPending(), one: 500, q25: 2, q75: 6 } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 6, price: 115 }], 2);
    expect(s2.t).toBeCloseTo(1.25);
    expect(s2.cycleCash).toBe(10_000 + 6 * 115);
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

describe("scheduler.cyclesFor — v4 phase 사이클", () => {
  it("국장 v4 = 매도(runAt) + 매수(15:20) 2사이클", () => {
    expect(cyclesFor({ strategy: "infinite_v4", market: "kr", runAt: "09:30" })).toEqual([
      { phase: "sell", at: "09:30" }, { phase: "buy", at: "15:20" },
    ]);
  });
  it("미장 v4 = both 1사이클(실제 LOC)", () => {
    expect(cyclesFor({ strategy: "infinite_v4", market: "us", runAt: "09:35" })).toEqual([
      { phase: "both", at: "09:35" },
    ]);
  });
  it("그 외 전략 = main 1사이클", () => {
    expect(cyclesFor({ strategy: "lrs_v1", market: "us", runAt: "09:35" })).toEqual([
      { phase: "main", at: "09:35" },
    ]);
  });
});
