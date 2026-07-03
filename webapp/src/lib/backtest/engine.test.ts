import { describe, it, expect } from "vitest";
import { runBacktest } from "./engine";
import type { Bar, InfiniteConfig } from "./types";

const cfg: InfiniteConfig = { principal: 4000, splits: 40, takeProfitPct: 0.1, locPremiumPct: 0.12 };

describe("runBacktest", () => {
  it("1회차 시장가 진입은 종가로 체결되고 자산곡선은 보유 평가액", () => {
    const bars: Bar[] = [{ date: "2024-01-01", open: 40, high: 41, low: 39, close: 40 }];
    const r = runBacktest(bars, cfg);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ side: "buy", price: 40, qty: 2, roundNo: 1 });
    expect(r.equityCurve[0]).toMatchObject({ date: "2024-01-01", equity: 80 }); // 2×40
  });

  it("평단+10% 도달하면 익절 매도 + 실현손익 계산", () => {
    const bars: Bar[] = [
      { date: "d1", open: 40, high: 40, low: 40, close: 40 }, // 진입 2주 @40
      { date: "d2", open: 44, high: 45, low: 44, close: 44 }, // 익절 44(평단40×1.1), high45>=44 체결. 매수LOC low44<=40 미체결
    ];
    const r = runBacktest(bars, cfg);
    const sell = r.trades.find((t) => t.side === "sell");
    expect(sell).toBeDefined();
    expect(sell!.price).toBe(44);
    expect(sell!.pnl).toBeCloseTo((44 - 40) * 2); // 8
    expect(r.totalPnl).toBeCloseTo(8);
  });

  it("매수 LOC 는 당일 저가가 지정가 이하일 때 체결", () => {
    const bars: Bar[] = [
      { date: "d1", open: 40, high: 40, low: 40, close: 40 }, // 진입 2주 @40
      { date: "d2", open: 40, high: 41, low: 39, close: 40 }, // 매도44 high41<44 미체결. 평단LOC@40 low39<=40 체결 등
    ];
    const r = runBacktest(bars, cfg);
    const buys = r.trades.filter((t) => t.side === "buy");
    expect(buys.length).toBeGreaterThanOrEqual(2); // 진입 + 2회차 LOC
    expect(r.trades.some((t) => t.side === "sell")).toBe(false); // 익절 미도달
  });

  it("빈 일봉이면 거래 없음", () => {
    const r = runBacktest([], cfg);
    expect(r.trades).toHaveLength(0);
    expect(r.equityCurve).toHaveLength(0);
    expect(r.totalPnl).toBe(0);
  });
});
