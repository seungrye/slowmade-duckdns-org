import { describe, it, expect } from "vitest";
import { topUpQty } from "./topup";

describe("topUpQty — 유휴현금 top-up 수량(현금 드래그 제거)", () => {
  it("전량 전략(rotation/LRS): 유휴현금 전액을 보유 종목에 투입(buyableQty 클램프)", () => {
    // 보유 10주×$100=$1000, 현금 $500 → 목표=현금+보유=1500, 현재=1000 → 부족 500 → floor(500/100)=5
    expect(topUpQty({ targetNotional: 1500, currentNotional: 1000, price: 100, buyableQty: 5 })).toBe(5);
  });

  it("buyableQty 로 클램프(원하는 수량보다 매수여력이 작으면 그만큼만)", () => {
    // 부족 500 → want 5 이지만 매수여력 3 → 3
    expect(topUpQty({ targetNotional: 1500, currentNotional: 1000, price: 100, buyableQty: 3 })).toBe(3);
  });

  it("이미 목표 이상이면 0(추가 매수 없음)", () => {
    expect(topUpQty({ targetNotional: 1000, currentNotional: 1000, price: 100, buyableQty: 5 })).toBe(0);
    expect(topUpQty({ targetNotional: 900, currentNotional: 1000, price: 100, buyableQty: 5 })).toBe(0);
  });

  it("추세(목표 비중): 목표 노출까지의 부족분만 매수", () => {
    // 총자산 10000, positionSize 10% → target 1000. 현재 보유 400 → 부족 600 → floor(600/50)=12
    expect(topUpQty({ targetNotional: 1000, currentNotional: 400, price: 50, buyableQty: 100 })).toBe(12);
  });

  it("매수여력 0 또는 가격 0 이면 0", () => {
    expect(topUpQty({ targetNotional: 1500, currentNotional: 1000, price: 100, buyableQty: 0 })).toBe(0);
    expect(topUpQty({ targetNotional: 1500, currentNotional: 1000, price: 0, buyableQty: 5 })).toBe(0);
  });

  it("1주 미만 부족분이면 0(더스트 방지)", () => {
    // 부족 50, price 100 → floor(0.5)=0
    expect(topUpQty({ targetNotional: 1050, currentNotional: 1000, price: 100, buyableQty: 5 })).toBe(0);
  });
});
