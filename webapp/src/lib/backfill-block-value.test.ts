import { describe, it, expect } from "vitest";
import { blockValueSeries, type BackfillTrade } from "./backfill-block-value";

const closes = (rows: [string, string, number][]) => {
  const m = new Map<string, Map<string, number>>();
  for (const [t, d, c] of rows) (m.get(t) ?? m.set(t, new Map()).get(t)!).set(d, c);
  return m;
};

describe("blockValueSeries", () => {
  const dates = ["2026-08-10", "2026-08-11", "2026-08-12"];

  it("매매를 누적해 종가로 평가한다", () => {
    const trades: BackfillTrade[] = [
      { ticker: "TQQQ", date: "2026-08-10", action: "buy", qty: 3, price: 50 },
      { ticker: "TQQQ", date: "2026-08-11", action: "buy", qty: 2, price: 52 },
    ];
    const out = blockValueSeries({
      trades,
      closes: closes([["TQQQ", "2026-08-10", 51], ["TQQQ", "2026-08-11", 52], ["TQQQ", "2026-08-12", 53]]),
      dates,
    });
    expect(out).toEqual([
      { date: "2026-08-10", holdingsValue: 3 * 51, qty: 3 },
      { date: "2026-08-11", holdingsValue: 5 * 52, qty: 5 },
      { date: "2026-08-12", holdingsValue: 5 * 53, qty: 5 },
    ]);
  });

  it("첫 매매 전 날짜는 그리지 않는다", () => {
    const out = blockValueSeries({
      trades: [{ ticker: "TQQQ", date: "2026-08-12", action: "buy", qty: 1 }],
      closes: closes([["TQQQ", "2026-08-12", 53]]),
      dates,
    });
    expect(out.map((p) => p.date)).toEqual(["2026-08-12"]);
  });

  it("매도로 수량이 준다 — 전량 매도면 0", () => {
    const out = blockValueSeries({
      trades: [
        { ticker: "TQQQ", date: "2026-08-10", action: "buy", qty: 4 },
        { ticker: "TQQQ", date: "2026-08-12", action: "sell", qty: 4 },
      ],
      closes: closes([["TQQQ", "2026-08-10", 50], ["TQQQ", "2026-08-12", 60]]),
      dates,
    });
    expect(out[0].holdingsValue).toBe(200);
    expect(out[2]).toEqual({ date: "2026-08-12", holdingsValue: 0, qty: 0 });
  });

  it("수량이 음수로 내려가지 않는다", () => {
    const out = blockValueSeries({
      trades: [
        { ticker: "TQQQ", date: "2026-08-10", action: "buy", qty: 1 },
        { ticker: "TQQQ", date: "2026-08-11", action: "sell", qty: 5 },
      ],
      closes: closes([["TQQQ", "2026-08-10", 50], ["TQQQ", "2026-08-11", 50]]),
      dates,
    });
    expect(out[1].qty).toBe(0);
  });

  it("종가가 빠진 날은 직전 종가를 끌어 쓴다 — 가짜 골짜기를 만들지 않는다", () => {
    const out = blockValueSeries({
      trades: [{ ticker: "TQQQ", date: "2026-08-10", action: "buy", qty: 2 }],
      // 08-11 종가 없음
      closes: closes([["TQQQ", "2026-08-10", 50], ["TQQQ", "2026-08-12", 60]]),
      dates,
    });
    expect(out.map((p) => p.holdingsValue)).toEqual([100, 100, 120]);
  });

  it("종가가 없으면 체결가로 시작한다", () => {
    const out = blockValueSeries({
      trades: [{ ticker: "SOXL", date: "2026-08-10", action: "buy", qty: 2, price: 105 }],
      closes: closes([]),
      dates,
    });
    expect(out.map((p) => p.holdingsValue)).toEqual([210, 210, 210]);
  });

  it("가격을 한 번도 못 본 종목은 0 으로 세지 않고 값에서 뺀다", () => {
    const out = blockValueSeries({
      trades: [
        { ticker: "TQQQ", date: "2026-08-10", action: "buy", qty: 2, price: 50 },
        { ticker: "???", date: "2026-08-10", action: "buy", qty: 9 },
      ],
      closes: closes([["TQQQ", "2026-08-10", 50], ["TQQQ", "2026-08-11", 50], ["TQQQ", "2026-08-12", 50]]),
      dates,
    });
    expect(out[0].holdingsValue).toBe(100);
  });

  it("여러 종목을 합산한다", () => {
    const out = blockValueSeries({
      trades: [
        { ticker: "AAPL", date: "2026-08-10", action: "buy", qty: 1 },
        { ticker: "MSFT", date: "2026-08-10", action: "buy", qty: 2 },
      ],
      closes: closes([
        ["AAPL", "2026-08-10", 100], ["MSFT", "2026-08-10", 200],
      ]),
      dates: ["2026-08-10"],
    });
    expect(out[0]).toEqual({ date: "2026-08-10", holdingsValue: 100 + 400, qty: 3 });
  });

  it("매매나 날짜가 없으면 빈 배열", () => {
    expect(blockValueSeries({ trades: [], closes: closes([]), dates })).toEqual([]);
    expect(blockValueSeries({
      trades: [{ ticker: "X", date: "2026-08-10", action: "buy", qty: 1 }],
      closes: closes([]), dates: [],
    })).toEqual([]);
  });
});
