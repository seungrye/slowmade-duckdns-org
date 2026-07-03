import { describe, it, expect } from "vitest";
import { generate, sma } from "./trend-following";
import type { TrendConfig, TrendState } from "./types";

const cfg: TrendConfig = { principal: 10000, shortMa: 2, longMa: 3 };

describe("trend-following sma", () => {
  it("최신순 앞 period 평균, period 미만이면 null", () => {
    expect(sma([10, 20, 30], 2)).toBe(15); // (10+20)/2
    expect(sma([10, 20, 30], 3)).toBe(20);
    expect(sma([10], 2)).toBeNull();
  });
});

describe("trend-following generate", () => {
  it("골든크로스(어제 단기≤장기, 오늘 단기>장기)에 원금만큼 시장가 진입", () => {
    // history 최신순 [10,5,5,5,5]: 오늘 st=7.5>lt=6.67(golden), 어제 sy=5=ly=5(not golden) → 크로스
    const state: TrendState = { price: 10, holdingQty: 0, avgPrice: 0, history: [10, 5, 5, 5, 5] };
    const sigs = generate(state, cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "buy", qty: 1000, price: 10, ordType: "market" }); // floor(10000/10)
  });

  it("데드크로스(오늘 단기≤장기)면 보유 전량 시장가 청산", () => {
    // [5,5,5,10]: 오늘 st=5=lt=5 → not golden, 보유 있음 → 청산
    const state: TrendState = { price: 5, holdingQty: 1000, avgPrice: 8, history: [5, 5, 5, 10] };
    const sigs = generate(state, cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "sell", qty: 1000, ordType: "market" });
  });

  it("이미 골든이면(어제도 골든) 재진입 안 함", () => {
    const state: TrendState = { price: 12, holdingQty: 0, avgPrice: 0, history: [12, 11, 10, 5] };
    // 오늘 golden, 어제도 golden → 크로스 아님
    expect(generate(state, cfg)).toHaveLength(0);
  });

  it("history 가 long+1 미만이면 신호 없음", () => {
    const state: TrendState = { price: 10, holdingQty: 0, avgPrice: 0, history: [10, 5] };
    expect(generate(state, cfg)).toHaveLength(0);
  });

  it("보유 중 골든 유지면 청산 안 함", () => {
    const state: TrendState = { price: 12, holdingQty: 1000, avgPrice: 10, history: [12, 11, 10, 5] };
    expect(generate(state, cfg)).toHaveLength(0);
  });
});
