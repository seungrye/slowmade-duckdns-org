import { describe, it, expect } from "vitest";
import { generateV2, generateV3, generateV4 } from "./trend-variants";
import { runTrendVariantBacktest } from "./trend-engine";
import type { Bar, TrendState, TrendV2Config, TrendV3Config, TrendV4Config } from "./types";

const st = (over: Partial<TrendState>): TrendState => ({
  price: 0, holdingQty: 0, avgPrice: 0, history: [], ...over,
});

describe("trend v2 — MA 돌파", () => {
  const cfg: TrendV2Config = { principal: 10000, maPeriod: 2 };

  it("종가가 MA 상향 돌파(어제 이하→오늘 초과)에 진입", () => {
    // [12,8,10]: 오늘 MA2=(12+8)/2=10 <12 ✓, 어제 MA2=(8+10)/2=9 ≥ 어제종가 8 ✓ → 돌파
    const sigs = generateV2(st({ price: 12, history: [12, 8, 10] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "buy", qty: 833, ordType: "market" }); // floor(10000/12)
  });

  it("보유 중 종가가 MA 아래면 전량 청산(상태 기준 — 돌파일 놓쳐도 청산)", () => {
    // [8,12,10]: MA2=(8+12)/2=10 > 종가 8 → 이탈
    const sigs = generateV2(st({ price: 8, holdingQty: 833, avgPrice: 12, history: [8, 12, 10] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "sell", qty: 833 });
  });

  it("어제도 MA 위였으면(돌파 아님) 재진입 안 함", () => {
    // [12,11,10]: 오늘 12>11.5, 어제 11>10.5 → 이미 위
    expect(generateV2(st({ price: 12, history: [12, 11, 10] }), cfg)).toHaveLength(0);
  });

  it("history 가 maPeriod+1 미만이면 신호 없음", () => {
    expect(generateV2(st({ price: 10, history: [10, 5] }), cfg)).toHaveLength(0);
  });
});

describe("trend v3 — 추세(기울기) 필터 골든크로스", () => {
  const cfg: TrendV3Config = { principal: 10000, shortMa: 2, longMa: 3, slopeDays: 1 };

  it("골든크로스 + 장기MA 상승이면 진입", () => {
    // [10,5,5,5,5]: 골든크로스(v1 동일) + lt(6.67) > 어제 lt(5) → 상승 ✓
    const sigs = generateV3(st({ price: 10, history: [10, 5, 5, 5, 5] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "buy", qty: 1000 });
  });

  it("골든크로스라도 장기MA 하락 중이면 진입 안 함(가짜 크로스 필터)", () => {
    // [6,4,4,8,8]: 오늘 golden(5>4.67) & 어제 not golden(4<5.33) → 크로스지만
    // ltPast(5.33) > lt(4.67) → 하락 중 → 필터
    expect(generateV3(st({ price: 6, history: [6, 4, 4, 8, 8] }), cfg)).toHaveLength(0);
  });

  it("데드크로스면 보유 전량 청산(v1 동일)", () => {
    const sigs = generateV3(st({ price: 5, holdingQty: 1000, avgPrice: 8, history: [5, 5, 5, 10, 10] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "sell", qty: 1000 });
  });

  it("history 가 long+slopeDays+1 미만이면 신호 없음", () => {
    expect(generateV3(st({ price: 10, history: [10, 5, 5, 5] }), cfg)).toHaveLength(0);
  });
});

describe("trend v4 — 트레일링 스탑", () => {
  const cfg: TrendV4Config = { principal: 10000, shortMa: 2, longMa: 3, trailPct: 0.3 };

  it("골든 유지 중이라도 고점 대비 -30% 이면 트레일링 스탑 청산", () => {
    // [65,60,20,10]: st=62.5>lt≈48.3(golden 유지) 인데 peak 100 → 65 ≤ 70 → 스탑
    const sigs = generateV4(st({ price: 65, holdingQty: 100, avgPrice: 50, peak: 100, history: [65, 60, 20, 10] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].side).toBe("sell");
    expect(sigs[0].reason).toContain("트레일링 스탑");
  });

  it("고점 대비 -30% 미만이면 데드크로스로 청산(v1 동일)", () => {
    // [90,90,90,100]: st=lt=90 → not golden, 90 > 70(peak100) → 데드크로스 사유
    const sigs = generateV4(st({ price: 90, holdingQty: 100, avgPrice: 50, peak: 100, history: [90, 90, 90, 100] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].reason).toContain("데드크로스");
  });

  it("골든 유지 + 고점 대비 하락폭 작으면 보유 지속", () => {
    // [95,90,80,50]: golden(92.5>88.3), 95 > 70 → 신호 없음
    expect(generateV4(st({ price: 95, holdingQty: 100, avgPrice: 50, peak: 100, history: [95, 90, 80, 50] }), cfg)).toHaveLength(0);
  });

  it("진입은 v1 과 동일(골든크로스)", () => {
    const sigs = generateV4(st({ price: 10, history: [10, 5, 5, 5] }), cfg);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ side: "buy", qty: 1000 });
  });
});

describe("runTrendVariantBacktest — peak 추적", () => {
  const bar = (date: string, close: number): Bar => ({ date, open: close, high: close, low: close, close });

  it("매수 후 최고 종가를 추적해 트레일링 스탑이 발동한다", () => {
    const cfg: TrendV4Config = { principal: 10000, shortMa: 2, longMa: 3, trailPct: 0.3 };
    // 5,5,5 → 10(골든크로스 매수 @10) → 20(peak=20) → 13(≤ 20×0.7=14 → 스탑 매도)
    const bars = [bar("d1", 5), bar("d2", 5), bar("d3", 5), bar("d4", 10), bar("d5", 20), bar("d6", 13)];
    const r = runTrendVariantBacktest(bars, cfg.longMa + 1, (s) => generateV4(s, cfg));
    expect(r.trades).toHaveLength(2);
    expect(r.trades[0]).toMatchObject({ side: "buy", price: 10, qty: 1000 });
    expect(r.trades[1]).toMatchObject({ side: "sell", price: 13, pnl: 3000 }); // (13-10)×1000
    expect(r.totalPnl).toBe(3000);
  });
});
