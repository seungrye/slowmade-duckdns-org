import { describe, it, expect } from "vitest";
import { LIVE_STRATEGY_IDS, LIVE_STRATEGY_LABEL } from "@/types/trading";
import TradingPortfolio from "@/models/trading-portfolio";

/**
 * 실매매 전략 목록이 어긋나면 여기서 깨진다 (#354).
 *
 * #352 와 같은 구조였다 — 모델 enum·API 검증·UI 맵이 각자 문자열을 들고 있었고, 타입이
 * 런타임 배열을 못 보니 어긋나도 컴파일이 통과했다. 전략을 추가하고 모델 enum 을 빠뜨리면
 * **그 전략은 저장이 400 으로 조용히 실패한다.**
 *
 * `Record<LiveStrategyId, …>` 로 선언한 맵들은 타입이 완전성을 강제하므로 여기서 안 본다.
 * mongoose enum 만 런타임 문자열이라 타입이 못 잡는다.
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
    // 백테스트에만 있는 전략(dual_momentum_v1 등)이 실매매 목록에 새어 들어오면
    // 설정 화면에서 고를 수 있게 되고, 고르는 순간 엔진이 없어 터진다.
    for (const backtestOnly of ["dual_momentum_v1", "vol_target_v1", "regime_v1", "trend_v2", "infinite_v2_2"]) {
      expect(LIVE_STRATEGY_IDS).not.toContain(backtestOnly);
    }
  });
});
