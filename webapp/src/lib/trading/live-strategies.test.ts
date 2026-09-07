import { describe, it, expect } from "vitest";
import { LIVE_STRATEGY_IDS, LIVE_STRATEGY_LABEL } from "@/types/trading";
import TradingPortfolio from "@/models/trading-portfolio";

/**
 * When the live strategy list drifts, this is what breaks (#354).
 *
 * The same shape as #352 - the model enum, the API validation and the UI map each held their own strings, and
 * since types cannot see a runtime array, a drift still compiled. Add a strategy and forget the model enum and
 * **saving that strategy fails silently with a 400.**
 *
 * Maps declared as `Record<LiveStrategyId, …>` have completeness enforced by the type, so they are not checked here.
 * Only the mongoose enum is a runtime string the type cannot catch.
 */
describe("실매매 전략 목록 단일 출처 (#354)", () => {
  it("포트폴리오 모델의 enum 이 LIVE_STRATEGY_IDS 와 같다", () => {
    const p = TradingPortfolio.schema.path("strategy") as {
      enumValues?: string[]; options?: { enum?: string[] };
    };
    const en = p.enumValues ?? p.options?.enum ?? [];
    expect([...en].sort()).toEqual([...LIVE_STRATEGY_IDS].sort());
  });

  it("전략마다 화면에 쓸 이름이 있다", () => {
    for (const id of LIVE_STRATEGY_IDS) {
      expect(LIVE_STRATEGY_LABEL[id], `${id} 라벨 없음`).toBeTruthy();
    }
  });

  it("중복이 없다", () => {
    expect(new Set(LIVE_STRATEGY_IDS).size).toBe(LIVE_STRATEGY_IDS.length);
  });

  it("백테스트 전략과 섞이지 않는다 — 일부러 다른 집합이다", () => {
    // If a backtest-only strategy (dual_momentum_v1 and the like) leaks into the live list it becomes selectable
    // on the settings screen, and choosing it blows up, because there is no engine.
    for (const backtestOnly of ["dual_momentum_v1", "vol_target_v1", "regime_v1", "trend_v2", "infinite_v2_2"]) {
      expect(LIVE_STRATEGY_IDS).not.toContain(backtestOnly);
    }
  });
});
