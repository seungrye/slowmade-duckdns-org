import { describe, it, expect, vi, beforeEach } from "vitest";

// 모델·시계 목킹 — DB/네트워크 없이 엔진 오케스트레이션(시드/채택/밴드/경계/현금캡)만 검증.
const orderLogs: Array<Record<string, unknown>> = [];
const persisted: Array<Record<string, unknown>> = [];

vi.mock("@/models/trading-order-log", () => ({
  default: { create: vi.fn(async (doc: Record<string, unknown>) => { orderLogs.push(doc); }) },
}));
vi.mock("@/models/trading-portfolio", () => ({
  default: {
    updateOne: vi.fn(async (_q: unknown, u: { $set: Record<string, unknown> }) => {
      persisted.push(u.$set["state.vr"] as Record<string, unknown>);
    }),
  },
}));
vi.mock("./engines", () => ({ marketToday: () => "20260722" }));

import { runValueRebalancing } from "./value-rebalancing-engine";
import type { V4Broker } from "./infinite-v4-engine";

type Fill = { date: string; side: "buy" | "sell"; qty: number; price: number };
const placeSpy = vi.fn(async () => "ORDER1");
function fakeBroker(o: { holding: number; price: number; cash: number; fills?: Fill[] }): V4Broker {
  return {
    snapshot: async () => ({ holding: o.holding, avg: 0, price: o.price, cash: o.cash }),
    historyLong: async () => [],
    executions: async () => (o.fills ?? []) as never,
    openOrders: async () => [],
    cancel: async () => {},
    place: placeSpy,
  };
}

const acct = (liveEnabled = false) => ({ _id: "acc1" as never, envKey: "paper-1", liveEnabled });
const pf = (config: object, state?: object) => ({
  _id: "pf1" as never, market: "us", strategy: "value_rebalancing", config, ...(state ? { state } : {}),
});
const CFG = { symbol: "TQQQ", principal: 10000, gradient: 10, bandPct: 0.15, poolLimitPct: 0.5, cycleDays: 10, initStockRatio: 0.85 };
const run = (broker: V4Broker, config: object = CFG, state?: object, live = false) =>
  runValueRebalancing(acct(live) as never, pf(config, state) as never, "run1" as never, broker, () => {});

beforeEach(() => { orderLogs.length = 0; persisted.length = 0; placeSpy.mockClear(); process.env.TRADING_LIVE_ALLOWED = "true"; });

describe("VR 엔진 — 시드/채택", () => {
  it("첫 실행·보유0 → 원금 85% 시드 매수 발주(다음 실행에서 채택)", async () => {
    await run(fakeBroker({ holding: 0, price: 100, cash: 10000 }));
    expect(orderLogs).toHaveLength(1);
    expect(orderLogs[0]).toMatchObject({ side: "buy", qty: 85, strategy: "value_rebalancing" }); // floor(8500/100)
    expect(persisted.at(-1)).toMatchObject({ vInit: false, lastRunDate: "20260722" }); // 미초기화 유지
  });

  it("첫 실행·기존 보유 → 재매수 없이 채택(V=보유×가격), 밴드 안이면 무주문", async () => {
    await run(fakeBroker({ holding: 85, price: 100, cash: 1500 }));
    expect(orderLogs).toHaveLength(0); // 8500 ∈ [7225,9775]
    expect(persisted.at(-1)).toMatchObject({ vInit: true, V: 8500 });
  });
});

describe("VR 엔진 — 밴드 리밸런스", () => {
  const seeded = { symbol: "TQQQ", vInit: true, qty: 85, pool: 1500, V: 8500, buyBudget: 750, sinceCycle: 0, cumBuy: 8500, cumSell: 0, lastRunDate: "20260721" };
  it("평가금 > 상단 → 매도", async () => {
    await run(fakeBroker({ holding: 85, price: 130, cash: 1500 }), CFG, { vr: seeded });
    expect(orderLogs).toHaveLength(1);
    expect(orderLogs[0]).toMatchObject({ side: "sell", qty: 9 }); // floor((11050-9775)/130)
  });
  it("평가금 < 하단 → 매수(Pool·한도 내)", async () => {
    await run(fakeBroker({ holding: 85, price: 80, cash: 5000 }), CFG, { vr: seeded });
    expect(orderLogs).toHaveLength(1);
    expect(orderLogs[0]).toMatchObject({ side: "buy", qty: 5 }); // floor((7225-6800)/80)
  });
  it("밴드 안 → 무주문", async () => {
    await run(fakeBroker({ holding: 85, price: 100, cash: 5000 }), CFG, { vr: seeded });
    expect(orderLogs).toHaveLength(0);
  });
  it("매수는 실계좌 현금으로 캡(공유 계좌 안전)", async () => {
    // 원하는 5주지만 현금 200 → floor(200/80)=2 주만
    await run(fakeBroker({ holding: 85, price: 80, cash: 200 }), CFG, { vr: seeded });
    expect(orderLogs[0]).toMatchObject({ side: "buy", qty: 2 });
  });
});

describe("VR 엔진 — 사이클 경계·게이트", () => {
  it("sinceCycle 도달 시 V 갱신(V += Pool/G, 거치)", async () => {
    const st = { symbol: "TQQQ", vInit: true, qty: 85, pool: 1500, V: 8500, buyBudget: 0, sinceCycle: 9, cumBuy: 8500, cumSell: 0, lastRunDate: "20260721" };
    await run(fakeBroker({ holding: 85, price: 100, cash: 1500 }), CFG, { vr: st });
    expect(persisted.at(-1)).toMatchObject({ V: 8650, sinceCycle: 0 }); // 8500 + 1500/10
  });

  it("dry-run 게이트: liveEnabled=false 면 broker.place 미호출·dryRun 기록", async () => {
    await run(fakeBroker({ holding: 0, price: 100, cash: 10000 }), CFG, undefined, false);
    expect(placeSpy).not.toHaveBeenCalled();
    expect(orderLogs[0]).toMatchObject({ dryRun: true, orderNo: "" });
  });

  it("live 게이트 통과: liveEnabled=true·ALLOWED → broker.place 호출", async () => {
    await run(fakeBroker({ holding: 0, price: 100, cash: 10000 }), CFG, undefined, true);
    expect(placeSpy).toHaveBeenCalledTimes(1);
    expect(orderLogs[0]).toMatchObject({ dryRun: false, orderNo: "ORDER1" });
  });
});
