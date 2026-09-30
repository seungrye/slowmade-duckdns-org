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
    // 2026-09-01 SOXL 64주는 VR 주문인데 v4 블록의 close-sync 가 infinite_v4 로 선점했다.
    expect(ownerLookup([v4, vr])("SOXL", "2026-09-01")?.strategy).toBe("value_rebalancing");
  });

  it("어느 블록도 안 무는 종목은 null — 계좌 귀속", () => {
    // 폐기된 trend 유니버스의 청산분 같은 옛 기록.
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

// 실제로 밟을 뻔한 함정: close-sync 는 90일치 체결을 다시 훑는다(LOOKBACK_DAYS).
// 날짜를 안 보면 나중에 생긴 블록이 옛 전략의 매매를 자기 것으로 끌어간다.
describe("ownerLookup — 블록 생성일 가드", () => {
  const vrSince: AttributionBlock = {
    id: "vr", strategy: "value_rebalancing", config: { symbol: "SOXL" }, since: "2026-09-01",
  };

  it("블록이 생기기 전의 체결은 그 블록 것이 아니다", () => {
    const owner = ownerLookup([vrSince]);
    // 2026-07-21 SOXL 은 rotation_v1 이 낸 것 — VR 블록은 9/1 에 생겼다.
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
    // 9/1 이후는 둘 다 살아 있어 모호 → 계좌 귀속
    expect(owner("SOXL", "2026-09-01")).toBeNull();
  });

  it("since 가 없으면 날짜를 안 따진다 (하위호환)", () => {
    const 무제한: AttributionBlock = { id: "x", strategy: "infinite_v4", config: { symbol: "TQQQ" } };
    expect(ownerLookup([무제한])("TQQQ", "2020-01-01")).toEqual({ id: "x", strategy: "infinite_v4" });
  });
});

// 블록 문서의 createdAt 은 "전략이 돌기 시작한 날"이 아니라 "문서를 쓴 날"이다.
// 국장 069500 은 v1→v4 편입이라 매매는 6/29 부터 있는데 블록 문서는 7/12 다.
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
    // 2026-09-01 SOXL 은 infinite_v4 로 잘못 기록돼 있다 → VR 로 교정되어야 한다.
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

// #505 — 귀속 버그 실수정. 옛 전략의 마지막 청산이 새 블록 생성 **당일**에 걸려 새 블록 것이
// 됐다(판정이 `date >= since`). 그 1건 때문에 블록 손익 분해가 42.06 만큼 안 맞았다:
//   TQQQ 2026-07-17 sell 4 @65.96 · 기록 전략 trend_v1 · v4 블록(since 07-17)에 귀속
//   대응 매수 3건은 무주 → 매수는 무주, 매도는 블록으로 갈려 손익이 사라졌다
describe("ownerLookup — 기록 전략이 다르면 귀속하지 않는다 (#505)", () => {
  const v4 = {
    id: "blk-v4", strategy: "infinite_v4", since: "2026-07-17",
    config: { symbol: "TQQQ" },
  };
  const owner = ownerLookup([v4]);

  it("생성 당일의 **매도** 이고 기록 전략이 다르면 거부한다 — 앞 전략의 청산이다", () => {
    expect(owner("TQQQ", "2026-07-17", "trend_v1", "sell")).toBeNull();
  });

  it("생성 당일의 **매수** 는 귀속한다 — 그 블록의 진입이다(VR 시드 같은)", () => {
    expect(owner("TQQQ", "2026-07-17", "trend_v1", "buy")).toMatchObject({ id: "blk-v4" });
  });

  it("생성일 이후의 매도는 기록 전략이 달라도 귀속한다 — 잘못 붙은 태그를 고칠 수 있어야 한다", () => {
    expect(owner("TQQQ", "2026-08-01", "trend_v1", "sell")).toMatchObject({ id: "blk-v4" });
  });

  it("기록 전략이 같으면 생성 당일 매도라도 귀속한다", () => {
    expect(owner("TQQQ", "2026-07-17", "infinite_v4", "sell")).toMatchObject({ id: "blk-v4" });
  });

  it("방향이나 기록 전략을 모르면 종전대로 귀속한다 — 옛 기록까지 놓지 않는다", () => {
    expect(owner("TQQQ", "2026-07-17")).toMatchObject({ id: "blk-v4" });
    expect(owner("TQQQ", "2026-07-17", "trend_v1")).toMatchObject({ id: "blk-v4" });
    expect(owner("TQQQ", "2026-07-17", "", "sell")).toMatchObject({ id: "blk-v4" });
  });

  it("069500 처럼 기록 전략이 이미 맞는 경우는 영향 없다", () => {
    // v1→v4 편입 케이스. 실측으로 그 81건은 전부 strategy=infinite_v4 로 기록돼 있어
    // veto 가 걸리지 않는다 — 걱정하던 경우는 애초에 위험하지 않았다.
    const kr = ownerLookup([{ id: "blk-kr", strategy: "infinite_v4", since: "2026-07-12",
                              config: { symbol: "069500" } }]);
    expect(kr("069500", "2026-08-01", "infinite_v4")).toMatchObject({ id: "blk-kr" });
  });

  it("since 이전이어도 기록 전략이 같으면 귀속한다 — 기존 폴백(v1→v4 편입) 그대로", () => {
    expect(owner("TQQQ", "2026-07-16", "infinite_v4", "sell")).toMatchObject({ id: "blk-v4" });
  });
});
