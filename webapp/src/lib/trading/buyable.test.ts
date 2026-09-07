import { describe, expect, it } from "vitest";
import { clampBuyQty, feeInclusiveQty, pickField } from "./buyable";

// Buyable quantity (fees included) - guards the regression where rotation/LRS all-in buys were rejected with 40250000.
// The real incident: SOXL @142.12, account buying power (gross) 101,579.74 USD.
//   Bug: floor(gross / price) = 714 shares -> over the KIS limit (max_ord_psbl_qty = 707) -> rejected.
//   Fix: 707 shares, from the per-symbol authoritative quantity (KIS) or a fee-inclusive calculation (Toss).

describe("buyable.pickField — KIS psamount 필드 우선순위", () => {
  // A real SOXL psamount response (paper-50194613, 2026-07-20)
  const soxl = {
    tr_crcy_cd: "USD", ord_psbl_frcr_amt: "101579.74", sll_ruse_psbl_amt: "97204.34",
    max_ord_psbl_qty: "707", frcr_ord_psbl_amt1: "100563.943590", ovrs_max_ord_psbl_qty: "707",
  };

  it("권위 수량 필드(max_ord_psbl_qty)를 먼저 읽는다", () => {
    expect(pickField(soxl, ["max_ord_psbl_qty", "ovrs_max_ord_psbl_qty", "ord_psbl_qty"])).toBe(707);
  });

  it("버그 재현 — 총액(ord_psbl_frcr_amt) floor 는 KIS 한도를 넘긴다", () => {
    const gross = pickField(soxl, ["ord_psbl_frcr_amt"])!;
    expect(Math.floor(gross / 142.12)).toBe(714); // over 707 - why the old code was rejected
  });

  it("앞 키가 비었으면 다음 키로 — 빈문자열/누락 건너뜀", () => {
    expect(pickField({ a: "", b: "62" }, ["a", "b"])).toBe(62);
    expect(pickField({ a: "" }, ["a", "missing"])).toBeNull();
    expect(pickField(undefined, ["a"])).toBeNull();
  });

  it("0 은 유효값(빈문자열과 구분)", () => {
    expect(pickField({ q: "0" }, ["q"])).toBe(0);
  });
});

describe("buyable.feeInclusiveQty — 토스(매수여력÷(가격×(1+수수료)))", () => {
  it("수수료 포함 수량은 총액 floor 를 넘지 않는다 (707 ≤ 714)", () => {
    // A gross of 101,579.74 with a ~1% fee buffer gives 707 SOXL shares (matching KIS's max_ord_psbl_qty)
    expect(feeInclusiveQty(101579.74, 142.12, 1.0)).toBe(707);
    expect(feeInclusiveQty(101579.74, 142.12, 0)).toBe(714); // with no fee, floor of the gross
  });

  it("토스 예시 — 매수여력 3500.5 USD, 미장 수수료 0.25%", () => {
    // floor(3500.5 / (142.12 × 1.0025)) = floor(24.57) = 24
    expect(feeInclusiveQty(3500.5, 142.12, 0.25)).toBe(24);
  });

  it("가격/현금 0 이하는 0", () => {
    expect(feeInclusiveQty(1000, 0, 0.25)).toBe(0);
    expect(feeInclusiveQty(0, 100, 0.25)).toBe(0);
    expect(feeInclusiveQty(-5, 100, 0.25)).toBe(0);
  });
});

describe("buyable.clampBuyQty — 전량매수 클램프", () => {
  it("원하는 수량과 매수가능수량의 min", () => {
    expect(clampBuyQty(714, 707)).toBe(707); // clamped by the limit
    expect(clampBuyQty(100, 707)).toBe(100); // within the limit, unchanged
  });
  it("1주 미만이면 0(매수 보류)", () => {
    expect(clampBuyQty(5, 0)).toBe(0);
    expect(clampBuyQty(0.4, 10)).toBe(0);
  });
  it("소수 수량은 내림", () => {
    expect(clampBuyQty(3.9, 10)).toBe(3);
  });
});
