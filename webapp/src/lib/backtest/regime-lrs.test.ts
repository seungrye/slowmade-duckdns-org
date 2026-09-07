import { describe, it, expect } from "vitest";
import { generateRegimeV1 } from "./regime";
import { runLrsBacktest } from "./lrs";
import type { Bar, RegimeV1Config, TrendState } from "./types";

const st = (over: Partial<TrendState>): TrendState => ({
  price: 0, holdingQty: 0, avgPrice: 0, history: [], ...over,
});

describe("regime_v1 — 레짐 필터 + 절대 모멘텀", () => {
  const cfg: RegimeV1Config = { principal: 10000, smaPeriod: 3, bandPct: 0.02, momDays: 2, trailPct: 0.25 };

  it("SMA+밴드 위 & 모멘텀 양수면 진입", () => {
    // [12,10,10]: SMA3 = 10.67, 12 > 10.67 x 1.02 = 10.88 yes, momentum 12 >= cl[2] = 10 yes
    const sigs = generateRegimeV1(st({ price: 12, history: [12, 10, 10] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "buy", qty: 833 });
  });

  it("레짐 위라도 모멘텀 음수면 진입 안 함", () => {
    // [12,10,13]: SMA3 = 11.67, is 12 > 11.90? 11.67 x 1.02 = 11.90 yes, just - but momentum 12 < cl[2] = 13 no
    expect(generateRegimeV1(st({ price: 12, history: [12, 10, 13] }), cfg)).toHaveLength(0);
  });

  it("밴드 안(SMA 부근)에서는 진입도 청산도 안 함(히스테리시스)", () => {
    // [10.1,10,10]: SMA = 10.03, 10.1 < 10.03 x 1.02 -> below the entry band
    expect(generateRegimeV1(st({ price: 10.1, history: [10.1, 10, 10] }), cfg)).toHaveLength(0);
    // While holding [9.9,10,10]: SMA = 9.97, 9.9 > 9.97 x 0.98 = 9.77 -> above the exit band, and not far enough off the high -> hold
    expect(generateRegimeV1(st({ price: 9.9, holdingQty: 10, avgPrice: 10, peak: 10, history: [9.9, 10, 10] }), cfg)).toHaveLength(0);
  });

  it("SMA-밴드 이탈이면 청산", () => {
    // [9,10,10]: SMA = 9.67, 9 < 9.67 x 0.98 = 9.47 -> out of the regime
    const sigs = generateRegimeV1(st({ price: 9, holdingQty: 10, avgPrice: 10, peak: 10, history: [9, 10, 10] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].reason).toContain("레짐 이탈");
  });

  it("고점 대비 트레일링 스탑 청산", () => {
    // [9,11,11]: SMA = 10.33, is 9 > 10.33 x 0.98 = 10.12? No (9 < 10.12, so the regime exit also triggers) - peak = 13 to check the stop wins
    const sigs = generateRegimeV1(st({ price: 9, holdingQty: 10, avgPrice: 10, peak: 13, history: [9, 11, 11] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].reason).toContain("트레일링 스탑"); // 9 <= 13 x 0.75 = 9.75 -> the stop fires before the regime exit
  });
});

describe("lrs_v1 — 지수 시그널로 레버리지 매매", () => {
  const bar = (date: string, close: number): Bar => ({ date, open: close, high: close, low: close, close });
  const cfg = { principal: 10000, smaPeriod: 3, bandPct: 0, trailPct: 0 };

  it("시그널 SMA 상회에 매매종목 매수, 하회에 매도", () => {
    const dates = ["d1", "d2", "d3", "d4", "d5"];
    const signal = [10, 10, 10, 12, 8].map((c, i) => bar(dates[i], c));
    const trade = [100, 100, 100, 110, 90].map((c, i) => bar(dates[i], c));
    // d4: signal SMA3 = (10+10+12)/3 = 10.67 < 12 -> buy @110. d5: SMA3 = (10+12+8)/3 = 10 > 8 -> sell @90.
    const r = runLrsBacktest(trade, signal, cfg);
    expect(r.trades).toHaveLength(2);
    expect(r.trades[0]).toMatchObject({ side: "buy", price: 110, qty: 90 }); // floor(10000/110)
    expect(r.trades[1]).toMatchObject({ side: "sell", price: 90, pnl: (90 - 110) * 90 });
  });

  it("시그널 이력이 길면 매매 시작일부터 바로 SMA 워밍업 완료", () => {
    // The signal covers 01-01 to 01-04 (4 days) while trading is only 01-04 - warmed up by past signal data, it decides on day one
    const signal = [bar("2020-01-01", 10), bar("2020-01-02", 10), bar("2020-01-03", 10), bar("2020-01-04", 12)];
    const trade = [bar("2020-01-04", 110)];
    const r = runLrsBacktest(trade, signal, cfg);
    expect(r.trades).toHaveLength(1); // SMA3 = (10+10+12)/3 = 10.67 < 12 -> buys at once
    expect(r.trades[0].side).toBe("buy");
  });

  it("트레일링 스탑: 시그널이 상승 레짐이어도 고점 대비 하락하면 청산", () => {
    const dates = ["d1", "d2", "d3", "d4", "d5", "d6"];
    const signal = [10, 10, 10, 12, 13, 14].map((c, i) => bar(dates[i], c)); // the regime keeps rising
    const trade = [100, 100, 100, 110, 200, 120].map((c, i) => bar(dates[i], c)); // high 200 -> 120 (-40%)
    const r = runLrsBacktest(trade, signal, { ...cfg, trailPct: 0.3 });
    expect(r.trades).toHaveLength(2);
    expect(r.trades[1]).toMatchObject({ side: "sell", price: 120 }); // 120 ≤ 200×0.7
  });
});
