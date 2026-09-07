import { describe, it, expect } from "vitest";
import { ownerLookup, contestedSymbols, type AttributionBlock } from "./fill-attribution";

const v4: AttributionBlock = { id: "v4", strategy: "infinite_v4", config: { symbol: "TQQQ" } };
const vr: AttributionBlock = { id: "vr", strategy: "value_rebalancing", config: { symbol: "SOXL" } };
const trend: AttributionBlock = { id: "tr", strategy: "trend_v1", config: { universe: ["AAPL", "MSFT"] } };
const rotation: AttributionBlock = { id: "ro", strategy: "rotation_v1", config: { gradient: 4 } };

describe("ownerLookup", () => {
  it("종목을 무는 블록이 하나면 그 블록에 귀속한다", () => {
    const owner = ownerLookup([v4, vr]);
    expect(owner("TQQQ", "2026-09-01")).toEqual({ id: "v4", strategy: "infinite_v4" });
    expect(owner("SOXL", "2026-09-01")).toEqual({ id: "vr", strategy: "value_rebalancing" });
  });

  it("실제로 틀렸던 케이스 — SOXL 이 v4 로 새지 않는다", () => {
    // The 2026-09-01 SOXL 64 shares was a VR order, but the v4 block's close-sync claimed it as infinite_v4.
    expect(ownerLookup([v4, vr])("SOXL", "2026-09-01")?.strategy).toBe("value_rebalancing");
  });

  it("어느 블록도 안 무는 종목은 null — 계좌 귀속", () => {
    // An older record, such as a liquidation from a retired trend universe.
    expect(ownerLookup([v4, vr])("OKE", "2026-09-01")).toBeNull();
  });

  it("두 블록이 같은 종목을 물면 null — 어느 쪽도 선점하지 않는다", () => {
    const dup: AttributionBlock = { id: "vr2", strategy: "value_rebalancing", config: { symbol: "TQQQ" } };
    expect(ownerLookup([v4, dup])("TQQQ", "2026-09-01")).toBeNull();
  });

  it("종목을 모르는 전략(rotation)은 아무것도 물지 않는다", () => {
    const owner = ownerLookup([v4, rotation]);
    expect(owner("TQQQ", "2026-09-01")).toEqual({ id: "v4", strategy: "infinite_v4" });
    expect(owner("SOXL", "2026-09-01")).toBeNull();
  });

  it("universe 전략은 그 안의 종목을 문다", () => {
    const owner = ownerLookup([trend]);
    expect(owner("AAPL", "2026-09-01")).toEqual({ id: "tr", strategy: "trend_v1" });
    expect(owner("TQQQ", "2026-09-01")).toBeNull();
  });

  it("같은 블록이 같은 종목을 중복 기재해도 겹침이 아니다", () => {
    const dupSelf: AttributionBlock = { id: "tr", strategy: "trend_v1", config: { universe: ["AAPL", "AAPL"] } };
    expect(ownerLookup([dupSelf])("AAPL", "2026-09-01")).toEqual({ id: "tr", strategy: "trend_v1" });
  });

  it("블록이 없으면 전부 null", () => {
    expect(ownerLookup([])("TQQQ", "2026-09-01")).toBeNull();
  });
});

describe("contestedSymbols", () => {
  it("겹치는 종목만 돌려준다", () => {
    const dup: AttributionBlock = { id: "vr2", strategy: "value_rebalancing", config: { symbol: "TQQQ" } };
    expect(contestedSymbols([v4, vr, dup])).toEqual(["TQQQ"]);
  });

  it("겹침이 없으면 빈 배열", () => {
    expect(contestedSymbols([v4, vr, trend, rotation])).toEqual([]);
  });
});

// A trap nearly stepped into: close-sync re-sweeps 90 days of fills (LOOKBACK_DAYS).
// Without checking the date, a block created later drags an older strategy's trades into its own.
describe("ownerLookup — 블록 생성일 가드", () => {
  const vrSince: AttributionBlock = {
    id: "vr", strategy: "value_rebalancing", config: { symbol: "SOXL" }, since: "2026-09-01",
  };

  it("블록이 생기기 전의 체결은 그 블록 것이 아니다", () => {
    const owner = ownerLookup([vrSince]);
    // The 2026-07-21 SOXL was rotation_v1's - the VR block was created on 9/1.
    expect(owner("SOXL", "2026-07-21")).toBeNull();
    expect(owner("SOXL", "2026-08-31")).toBeNull();
  });

  it("생성일 당일부터는 그 블록 것이다", () => {
    expect(ownerLookup([vrSince])("SOXL", "2026-09-01")).toEqual({
      id: "vr", strategy: "value_rebalancing",
    });
  });

  it("v4(TQQQ, 07-17 생성)는 6월 trend_v1 의 TQQQ 를 가져가지 않는다", () => {
    const v4Since: AttributionBlock = {
      id: "v4", strategy: "infinite_v4", config: { symbol: "TQQQ" }, since: "2026-07-17",
    };
    const owner = ownerLookup([v4Since]);
    expect(owner("TQQQ", "2026-06-23")).toBeNull();
    expect(owner("TQQQ", "2026-08-10")).toEqual({ id: "v4", strategy: "infinite_v4" });
  });

  it("기간이 안 겹치는 두 블록은 겹침이 아니다 — 각자 자기 기간을 갖는다", () => {
    const 옛: AttributionBlock = {
      id: "old", strategy: "rotation_v1", config: { symbol: "SOXL" }, since: "2026-07-01",
    };
    const owner = ownerLookup([옛, vrSince]);
    expect(owner("SOXL", "2026-07-21")).toEqual({ id: "old", strategy: "rotation_v1" });
    // From 9/1 both are alive, so it is ambiguous -> attributed to the account
    expect(owner("SOXL", "2026-09-01")).toBeNull();
  });

  it("since 가 없으면 날짜를 안 따진다 (하위호환)", () => {
    const 무제한: AttributionBlock = { id: "x", strategy: "infinite_v4", config: { symbol: "TQQQ" } };
    expect(ownerLookup([무제한])("TQQQ", "2020-01-01")).toEqual({ id: "x", strategy: "infinite_v4" });
  });
});

// A block document's createdAt is "the day the document was written", not "the day the strategy started running".
// KRX 069500 moved from v1 to v4, so its trades start on 6/29 while the block document dates from 7/12.
describe("ownerLookup — 이미 기록된 전략이 생성일보다 강한 증거", () => {
  const kr: AttributionBlock = {
    id: "kr", strategy: "infinite_v4", config: { symbol: "069500" }, since: "2026-07-12",
  };

  it("생성일 전이어도 기록된 전략이 같으면 그 블록 것이다", () => {
    expect(ownerLookup([kr])("069500", "2026-06-29", "infinite_v4")).toEqual({
      id: "kr", strategy: "infinite_v4",
    });
  });

  it("기록된 전략이 다르면 여전히 아니다 — 7월 rotation 의 SOXL 을 VR 이 가져가지 않는다", () => {
    const vr: AttributionBlock = {
      id: "vr", strategy: "value_rebalancing", config: { symbol: "SOXL" }, since: "2026-09-01",
    };
    expect(ownerLookup([vr])("SOXL", "2026-07-21", "rotation_v1")).toBeNull();
  });

  it("날짜로 가려지면 기록된 전략이 틀려도 날짜가 이긴다 — 잘못 붙은 태그를 고칠 수 있어야 한다", () => {
    const vr: AttributionBlock = {
      id: "vr", strategy: "value_rebalancing", config: { symbol: "SOXL" }, since: "2026-09-01",
    };
    // The 2026-09-01 SOXL is recorded as infinite_v4 by mistake and must be corrected to VR.
    expect(ownerLookup([vr])("SOXL", "2026-09-01", "infinite_v4")).toEqual({
      id: "vr", strategy: "value_rebalancing",
    });
  });

  it("기록된 전략을 안 주면(새 체결) 날짜 가드만 쓴다", () => {
    expect(ownerLookup([kr])("069500", "2026-06-29")).toBeNull();
  });

  it("같은 전략의 블록이 둘이면 전략으로도 못 가린다", () => {
    const kr2: AttributionBlock = {
      id: "kr2", strategy: "infinite_v4", config: { symbol: "069500" }, since: "2026-07-12",
    };
    expect(ownerLookup([kr, kr2])("069500", "2026-06-29", "infinite_v4")).toBeNull();
  });
});
