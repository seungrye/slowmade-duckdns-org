import { describe, it, expect } from "vitest";
import { LIVE_STRATEGY_IDS } from "./trading";
import { strategyMarker, strategyLabel } from "./trading-marker";

/**
 * 매매 차트의 전략별 마커 (#367).
 *
 * 예전엔 화면이 `s === "infinite_v1" ? … : s === "trend_v1" ? … : "기타"` 로 두 전략만
 * 알고 있었다. 그래서 실제 기록의 `infinite_v4` 145건·`rotation_v1` 4건이 **전부 "기타 ○"**
 * 로 그려졌고, VR 이 돌기 시작하면 SOXL 매매도 같은 취급이라 TQQQ 와 구분이 안 된다.
 *
 * 목록은 `LIVE_STRATEGY_IDS` 가 원본이고 매핑은 `Record<LiveStrategyId, …>` 라,
 * 전략을 더하면 **컴파일이 깨져서** 여기를 빠뜨릴 수 없다.
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
    // 실측(2026-09-01): infinite_v4 145건 · trend_v1 68건 · rotation_v1 4건.
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
