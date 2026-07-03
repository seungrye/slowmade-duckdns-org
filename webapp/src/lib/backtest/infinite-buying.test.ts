import { describe, it, expect } from "vitest";
import { generate } from "./infinite-buying";
import type { InfiniteConfig, MarketState } from "./types";

// principal 4000 / splits 40 → dailyBudget 100.
const cfg: InfiniteConfig = { principal: 4000, splits: 40, takeProfitPct: 0.1, locPremiumPct: 0.12 };

describe("infinite-buying generate", () => {
  it("1회차: 하루예산으로 2주 이상이면 시장가 매수", () => {
    // price 40, budget 100 → floor(100/40)=2주
    const state: MarketState = { price: 40, holdingQty: 0, avgPrice: 0, roundNo: 0 };
    const sigs = generate(state, cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "buy", qty: 2, price: 40, ordType: "market" });
  });

  it("1회차: 하루예산으로 2주 미만이면 매수 안 함", () => {
    // price 60, budget 100 → floor(100/60)=1주 < 2
    const state: MarketState = { price: 60, holdingQty: 0, avgPrice: 0, roundNo: 0 };
    expect(generate(state, cfg)).toHaveLength(0);
  });

  it("보유분이 있으면 평단+익절% 전량 지정가 매도", () => {
    const state: MarketState = { price: 45, holdingQty: 5, avgPrice: 40, roundNo: 3 };
    const sell = generate(state, cfg).find((s) => s.side === "sell");
    expect(sell).toMatchObject({ side: "sell", qty: 5, price: 44, ordType: "limit" }); // 40×1.1=44
  });

  it("2회차 이후: 평단 LOC + 프리미엄 LOC 2건", () => {
    // roundNo 1, price 40, avg 40, half 50 → avgQty=floor(50/40)=1, locQty=floor(50/40)=1
    const state: MarketState = { price: 40, holdingQty: 2, avgPrice: 40, roundNo: 1 };
    const buys = generate(state, cfg).filter((s) => s.side === "buy" && s.ordType === "loc");
    expect(buys).toHaveLength(2);
    expect(buys[0]).toMatchObject({ qty: 1, price: 40, ordType: "loc" }); // 평단 LOC
    expect(buys[1]).toMatchObject({ qty: 1, price: 44.8, ordType: "loc" }); // 40×1.12=44.8
  });

  it("원금 소진(roundNo>=splits) 후에는 매수 없이 매도만", () => {
    const state: MarketState = { price: 45, holdingQty: 10, avgPrice: 40, roundNo: 40 };
    const sigs = generate(state, cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].side).toBe("sell");
  });

  it("보유 없고 roundNo 0 이면 매도 신호 없음", () => {
    const state: MarketState = { price: 40, holdingQty: 0, avgPrice: 0, roundNo: 0 };
    expect(generate(state, cfg).some((s) => s.side === "sell")).toBe(false);
  });
});
