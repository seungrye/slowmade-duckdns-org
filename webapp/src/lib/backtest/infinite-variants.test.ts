import { describe, it, expect } from "vitest";
import { runInfiniteVariantBacktest } from "./infinite-variants";
import type { Bar } from "./types";

const bar = (date: string, close: number, high = close, low = close): Bar => ({ date, open: close, high, low, close });

describe("무한매수 변형 공통 골격", () => {
  it("v2.2 전반전: 하락일에 평단 LOC + 별% LOC 두 건 매수(반반)", () => {
    // splits=4(half=2), 1회=1000. d1 진입(10주@100, T=1). d2 종가 90 → 평단(100)·별%(+5%=105) LOC 모두 종가 체결.
    const bars = [bar("d1", 100), bar("d2", 90)];
    const r = runInfiniteVariantBacktest(bars, { principal: 4000, splits: 4, version: "v2_2" });
    const d2buys = r.trades.filter((t) => t.date === "d2" && t.side === "buy");
    expect(r.trades[0]).toMatchObject({ date: "d1", side: "buy", qty: 10, price: 100 });
    expect(d2buys).toHaveLength(2); // 전반전 반반 매수
    expect(d2buys.every((t) => t.price === 90)).toBe(true); // LOC = 종가 체결
  });

  it("v2.2 급등일: 25% 쿼터 LOC + 75% 지정가 매도로 사이클 종료 후 재진입", () => {
    const bars = [bar("d1", 100), bar("d2", 130, 130), bar("d3", 100)];
    const r = runInfiniteVariantBacktest(bars, { principal: 4000, splits: 4, version: "v2_2" });
    const d2sells = r.trades.filter((t) => t.date === "d2" && t.side === "sell");
    expect(d2sells).toHaveLength(2); // 쿼터(2주) + 75%(8주)
    expect(d2sells.reduce((s, t) => s + t.qty, 0)).toBe(10); // 전량 소진 → 리셋
    expect(r.trades.some((t) => t.date === "d3" && t.side === "buy")).toBe(true); // 새 사이클 진입
    expect(r.totalPnl).toBeGreaterThan(0);
  });

  it("v2.1 후반전: 평단 이하만 매수 + 3단 매도(+0% LOC 쿼터)", () => {
    // splits=2(half=1) → 진입 직후(T=1)부터 후반전. d2 하락 90: 평단 LOC 1건만(큰수 없음).
    // d3 96(> 평단 95): 매수 0건, 매도는 쿼터(+0% LOC, 96≥95)만 체결(+5%/+10% 지정가 미달).
    const bars = [bar("d1", 100), bar("d2", 90), bar("d3", 96, 96)];
    const r = runInfiniteVariantBacktest(bars, { principal: 2000, splits: 2, version: "v2_1" });
    expect(r.trades.filter((t) => t.date === "d2" && t.side === "buy")).toHaveLength(1); // 후반 1건
    expect(r.trades.filter((t) => t.date === "d3" && t.side === "buy")).toHaveLength(0); // 평단 위 → 매수 없음
    const d3sells = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sells).toHaveLength(1); // +0% LOC 쿼터만 체결
    expect(d3sells[0].qty).toBe(5); // floor(20/4)
  });

});
