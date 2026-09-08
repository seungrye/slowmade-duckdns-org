import { describe, it, expect } from "vitest";
import { LIVE_STRATEGY_IDS } from "./trading";
import { strategyMarker, strategyLabel } from "./trading-marker";

/**
 * The trade chart's per-strategy markers (#367).
 *
 * The screen used to know two strategies through `s === "infinite_v1" ? … : s === "trend_v1" ? … : "other"`.
 * So the real records' 145 `infinite_v4` and 4 `rotation_v1` entries were **all drawn as "other"**,
 * and once VR started running the SOXL trades would get the same treatment and be indistinguishable from TQQQ's.
 *
 * `LIVE_STRATEGY_IDS` is the list's source and the mapping is a `Record<LiveStrategyId, …>`, so
 * adding a strategy **breaks the compile** and this cannot be forgotten.
 */
describe("전략별 마커 (#367)", () => {
  it("지금 도는 전략은 전부 제 모양·이름을 가진다", () => {
    for (const id of LIVE_STRATEGY_IDS) {
      expect(strategyMarker(id), `${id} 모양 없음`).not.toBe("circle");
      expect(strategyLabel(id), `${id} 이름 없음`).not.toBe("기타");
    }
  });

  it("모양이 서로 겹치지 않는다 — 겹치면 구분이 안 된다", () => {
    const 모양 = LIVE_STRATEGY_IDS.map(strategyMarker);
    expect(new Set(모양).size).toBe(모양.length);
  });

  it("실제 기록에 있는 값이 기타로 안 떨어진다", () => {
    // Measured (2026-09-01): 145 infinite_v4, 68 trend_v1 and 4 rotation_v1.
    for (const s of ["infinite_v4", "trend_v1", "rotation_v1"]) {
      expect(strategyLabel(s), `${s} 가 기타로 떨어진다`).not.toBe("기타");
    }
  });

  it("옛 기록의 전략은 기타로 떨어뜨린다 — 지금 안 도는 것이다", () => {
    expect(strategyLabel("infinite_v1")).toBe("기타");
    expect(strategyMarker("infinite_v1")).toBe("circle");
  });

  it("빈 값·모르는 값도 견딘다", () => {
    for (const s of [undefined, "", "무엇인가"]) {
      expect(strategyLabel(s)).toBe("기타");
      expect(strategyMarker(s)).toBe("circle");
    }
  });
});
