import { describe, expect, it } from "vitest";
import { validateStrategyConfig as v } from "@/lib/trading/config-validate";

// #507 — config 숫자가 검증되지 않아 0·빈문자열이 그대로 주문 파라미터가 됐다.
// `??` 는 빈문자열을 못 막는다(Number("") === 0) — #491 에서 평단 0 이 0원 매도를 만든 계열.
describe("validateStrategyConfig — 0·빈문자열을 입구에서 끊는다", () => {
  it("infinite_v4: symbol·principal 필수", () => {
    expect(v("infinite_v4", { principal: 100 })).toContain("symbol");
    expect(v("infinite_v4", { symbol: "TQQQ" })).toContain("principal");
    expect(v("infinite_v4", { symbol: "TQQQ", principal: 100 })).toBeNull();
  });
  it("infinite_v4: 선택 필드도 적었으면 양수여야 한다", () => {
    const base = { symbol: "TQQQ", principal: 100 };
    expect(v("infinite_v4", { ...base, splits: 0 })).toContain("splits");
    expect(v("infinite_v4", { ...base, sellTarget: "" })).toContain("sellTarget");
    expect(v("infinite_v4", { ...base, starBase: -1 })).toContain("starBase");
    expect(v("infinite_v4", { ...base, splits: 20, sellTarget: 15 })).toBeNull();
  });
  it("빈문자열 principal 은 0 이 아니라 거부다", () => {
    expect(v("infinite_v4", { symbol: "TQQQ", principal: "" })).toContain("principal");
  });
  it("value_rebalancing: principal·gradient 필수", () => {
    expect(v("value_rebalancing", { symbol: "SOXL", principal: 100 })).toContain("gradient");
    expect(v("value_rebalancing", { symbol: "SOXL", principal: 100, gradient: 10 })).toBeNull();
  });
  it("lrs_v1 / rotation_v1 / trend_v1 — 안 쓰던 전략도 막는다", () => {
    expect(v("lrs_v1", {})).toContain("signal");
    expect(v("lrs_v1", { signal: "QQQ", target: "TQQQ", sma: 0 })).toContain("sma");
    expect(v("lrs_v1", { signal: "QQQ", target: "TQQQ" })).toBeNull();
    expect(v("rotation_v1", { signal: "QQQ", mom: "" })).toContain("mom");
    expect(v("trend_v1", { universe: [] })).toContain("universe");
    expect(v("trend_v1", { universeRef: "kospi200-kr", positionSize: 0.1 })).toBeNull();
  });
  it("모르는 전략은 통과시킨다(모델 enum 이 이미 막는다)", () => {
    expect(v("unknown", {})).toBeNull();
  });
});

// #517 — #507 의 검증기가 **0 이 의미를 갖는 필드**까지 양수로 묶었다.
// 실 DB 의 VR 블록(SOXL)이 `feeRate: 0` 이라 그 블록은 **어떤 저장도 안 됐다** —
// 활성 토글조차 400 으로 튕겼고, toggleEnabled 는 응답을 안 봐서 화면엔 아무 말도 없었다.
//
// #507 이 막으려던 건 `splits: 0`·`sellTarget: ""` 같은 **주문 파라미터**가 0 으로
// 저장되는 것이다. "수수료 0%"·"밴드 0" 은 그 부류가 아니다.

const VR_REAL = {
  symbol: "SOXL", principal: 8000, gradient: 10, bandPct: 0.15,
  cycleDays: 10, initStockRatio: 0.85, cashflow: 0, feeRate: 0, formula: "skill",
};

describe("0 이 의미를 갖는 필드는 0 을 받는다 (#517)", () => {
  it("실 DB 의 VR 블록이 저장된다 — 이게 안 되면 비활성화도 못 한다", () => {
    expect(v("value_rebalancing", VR_REAL)).toBeNull();
  });

  it("feeRate: 0 은 '수수료 없음' 이다", () => {
    expect(v("value_rebalancing", { symbol: "A", principal: 1, gradient: 1, feeRate: 0 })).toBeNull();
  });

  it("band: 0 은 '밴드 없음' 이다 — lrs·rotation 둘 다", () => {
    expect(v("lrs_v1", { signal: "QQQ", target: "TQQQ", band: 0 })).toBeNull();
    expect(v("rotation_v1", { signal: "QQQ", band: 0 })).toBeNull();
  });

  it("음수는 여전히 막는다 — 0 을 허용한 것이지 아무 값이나 받는 게 아니다", () => {
    expect(v("value_rebalancing", { symbol: "A", principal: 1, gradient: 1, feeRate: -1 })).toBeTruthy();
    expect(v("lrs_v1", { signal: "QQQ", target: "TQQQ", band: -0.1 })).toBeTruthy();
  });

  it("빈 문자열은 여전히 막는다 — Number(\"\")===0 으로 새어 들어오면 안 된다", () => {
    expect(v("value_rebalancing", { symbol: "A", principal: 1, gradient: 1, feeRate: "" })).toBeTruthy();
    expect(v("lrs_v1", { signal: "QQQ", target: "TQQQ", band: "" })).toBeTruthy();
  });

  it("주문 크기를 정하는 값은 0 을 계속 거부한다 — #507 이 막으려던 바로 그것", () => {
    expect(v("infinite_v4", { symbol: "T", principal: 100, splits: 0 })).toBeTruthy();
    expect(v("infinite_v4", { symbol: "T", principal: 100, sellTarget: 0 })).toBeTruthy();
    expect(v("value_rebalancing", { symbol: "A", principal: 1, gradient: 1, cycleDays: 0 })).toBeTruthy();
    expect(v("value_rebalancing", { symbol: "A", principal: 1, gradient: 0 })).toBeTruthy();
  });
});
