import { describe, it, expect } from "vitest";
import { runInfiniteVariantBacktest } from "./infinite-variants";
import type { Bar } from "./types";

const bar = (date: string, close: number, high = close, low = close): Bar => ({ date, open: close, high, low, close });

describe("무한매수 변형 공통 골격", () => {
  it("v2.2 전반전: 하락일에 평단 LOC + 별% LOC 두 건 매수(반반)", () => {
    // splits=4 (half=2), one round = 1000. d1 enters (10 shares @100, T=1). d2 close 90 -> both the average (100) and star% (+5% = 105) LOCs fill at the close.
    const bars = [bar("d1", 100), bar("d2", 90)];
    const r = runInfiniteVariantBacktest(bars, { principal: 4000, splits: 4, version: "v2_2" });
    const d2buys = r.trades.filter((t) => t.date === "d2" && t.side === "buy");
    expect(r.trades[0]).toMatchObject({ date: "d1", side: "buy", qty: 10, price: 100 });
    expect(d2buys).toHaveLength(2); // the first half's split buy
    expect(d2buys.every((t) => t.price === 90)).toBe(true); // an LOC fills at the close
  });

  it("v2.2 급등일: 25% 쿼터 LOC + 75% 지정가 매도로 사이클 종료 후 재진입", () => {
    const bars = [bar("d1", 100), bar("d2", 130, 130), bar("d3", 100)];
    const r = runInfiniteVariantBacktest(bars, { principal: 4000, splits: 4, version: "v2_2" });
    const d2sells = r.trades.filter((t) => t.date === "d2" && t.side === "sell");
    expect(d2sells).toHaveLength(2); // the quarter (2 shares) plus the 75% (8 shares)
    expect(d2sells.reduce((s, t) => s + t.qty, 0)).toBe(10); // fully wound down -> reset
    expect(r.trades.some((t) => t.date === "d3" && t.side === "buy")).toBe(true); // a new cycle enters
    expect(r.totalPnl).toBeGreaterThan(0);
  });

  it("v2.1 후반전: 평단 이하만 매수 + 3단 매도(+0% LOC 쿼터)", () => {
    // splits=2 (half=1) -> the second half starts right after entry (T=1). d2 falls to 90: only the average-price LOC (no big buy).
    // d3 at 96 (above the average of 95): no buys, and only the quarter (the +0% LOC, 96 >= 95) sells (the +5%/+10% limits are not reached).
    const bars = [bar("d1", 100), bar("d2", 90), bar("d3", 96, 96)];
    const r = runInfiniteVariantBacktest(bars, { principal: 2000, splits: 2, version: "v2_1" });
    expect(r.trades.filter((t) => t.date === "d2" && t.side === "buy")).toHaveLength(1); // one order in the second half
    expect(r.trades.filter((t) => t.date === "d3" && t.side === "buy")).toHaveLength(0); // above the average -> no buy
    const d3sells = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sells).toHaveLength(1); // only the +0% LOC quarter fills
    expect(d3sells[0].qty).toBe(5); // floor(20/4)
  });

});
