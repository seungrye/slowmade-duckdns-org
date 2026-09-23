import { describe, expect, it } from "vitest";
import { v4PlanDay } from "./v4-plan";

// #491 — 오염된 입력(평단 0·참조가 0)이 그대로 주문이 되던 회귀 방지.
// 규칙 자체(사다리·별지점 등)는 backtest/infinite-v4.test.ts 가 벡터로 검증한다.
// 여기서는 **입력이 망가졌을 때 무엇을 내보내지 않는가** 만 본다.

const cfg = { splits: 20, starBase: 15, sellTarget: 0.1 };
const base = {
  mode: "normal" as const, t: 6.93, holding: 32, cash: 6_000_000,
  entryLimit: null, prev5: [] as number[], reverseFirstDay: false, cfg,
};
const plan = (avg: number, refPrice: number) => v4PlanDay({ ...base, avg, refPrice });
const sells = (avg: number, refPrice: number) => plan(avg, refPrice).filter((o) => o.side === "sell");

describe("v4PlanDay — 값이 0 인 주문은 내보내지 않는다", () => {
  it("평단 0(빈 응답 파싱) 이어도 0원 매도를 만들지 않는다", () => {
    // 예전: { tag: q75, qty: 24, price: 0 } 이 나왔다. 국장이면 호가단위 라운딩으로
    // 5원 지정가 매도가 돼 보유 전량이 사실상 시장가로 투매된다.
    expect(plan(0, 110_000).every((o) => o.price > 0)).toBe(true);
    expect(sells(0, 110_000)).toHaveLength(0);
  });

  it("참조가 0(장 마감·휴장 시 KIS 가 주는 값) 이어도 0원 주문이 없다", () => {
    expect(plan(100_000, 0).every((o) => o.price > 0)).toBe(true);
  });

  it("둘 다 0 이어도 아무것도 안 내보낸다", () => {
    expect(plan(0, 0)).toHaveLength(0);
  });
});

// 위 가드를 "q75 에도 하한(floorP)을 넣자" 로 풀면 여기가 깨진다.
// q75 는 LOC 가 아니라 장중 지정가라, 시장가 아래 지정가 매도가 즉시 체결되는 게 정상이다.
describe("v4PlanDay — 갭상승에서 익절은 살아 있어야 한다(하한 금지 회귀)", () => {
  it("현재가가 평단보다 한참 위면 q75 가 floorP 아래여도 걸린다", () => {
    const refPrice = 150_000;
    const q75 = sells(100_000, refPrice).find((o) => o.tag === "q75");
    expect(q75).toBeDefined();
    expect(q75!.price).toBe(110_000);
    expect(q75!.price).toBeLessThan(refPrice * 0.8); // floorP=120,000 — 하한을 넣으면 탈락한다
  });

  it("정상 입력은 q25·q75 둘 다 그대로", () => {
    expect(sells(100_000, 110_000).map((o) => o.tag).sort()).toEqual(["q25", "q75"]);
  });
});
