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
