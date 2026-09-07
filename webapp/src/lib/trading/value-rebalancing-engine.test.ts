import { describe, it, expect, vi, beforeEach } from "vitest";

// Quarter buy - if star point R exceeds reference + 20% (right after a crash), fold down to the big-buy point.
// Models and the clock are mocked - only the engine's orchestration (seed, adoption, bands, boundaries, cash cap) is checked, with no DB or network.
type OrderLog = Record<string, unknown> & { side: string; qty: number; price: number; ordType: string };
const orderLogs: OrderLog[] = [];
const persisted: Array<Record<string, unknown>> = [];

vi.mock("@/models/trading-order-log", () => ({
  default: { create: vi.fn(async (doc: Record<string, unknown>) => { orderLogs.push(doc as OrderLog); }) },
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
    expect(persisted.at(-1)).toMatchObject({ vInit: false, lastRunDate: "20260722" }); /** Order logs - the ladder checks read quantity and price often, so only those two are typed (#360). */
  });

  it("첫 실행·기존 보유 → 재매수 없이 채택(V=보유×가격)", async () => {
    await run(fakeBroker({ holding: 85, price: 100, cash: 1500 }));
    // stays uninitialised
    expect(persisted.at(-1)).toMatchObject({ vInit: true, V: 8500 });
    expect(orderLogs.some((o) => o.ordType === "market")).toBe(false);
  });
});

describe("VR 엔진 — 밴드 리밸런스", () => {
  const seeded = { symbol: "TQQQ", vInit: true, qty: 85, pool: 1500, V: 8500, buyBudget: 750, sinceCycle: 0, cumBuy: 8500, cumSell: 0, lastRunDate: "20260721" };
  // Adoption is the point - take what is held as it is and just set V. There is no market re-buy.
  // #360 - the ladder is placed against the band boundaries, so "the price is outside the band right now" means
  it("평가금 > 상단 → 매도 사다리가 현재가 아래(=즉시 체결 가능)까지 내려온다", async () => {
    await run(fakeBroker({ holding: 85, price: 130, cash: 1500 }), CFG, { vr: seeded });
    const 매도 = orderLogs.filter((o) => o.side === "sell");
    expect(매도.length).toBeGreaterThan(0);
    expect(Math.min(...매도.map((o) => o.price))).toBeLessThanOrEqual(130);
  });
  it("평가금 < 하단 → 매수 사다리가 현재가 위(=즉시 체결 가능)까지 올라온다", async () => {
    await run(fakeBroker({ holding: 85, price: 80, cash: 5000 }), CFG, { vr: seeded });
    const 매수 = orderLogs.filter((o) => o.side === "buy");
    expect(매수.length).toBeGreaterThan(0);
    expect(Math.max(...매수.map((o) => o.price))).toBeGreaterThanOrEqual(80);
  });
  // some rungs are already fillable. This checks that such a rung's limit sits on the favourable side of the current price.
  // #360 - with the ladder, **orders go out even inside the band.** That is what the source does: place one-share
  // limits against the band boundaries and wait for the price to come. Previously only one order went out near the
  it("밴드 안 → 양쪽 사다리를 걸어 둔다(체결은 가격이 와야 한다)", async () => {
    await run(fakeBroker({ holding: 85, price: 100, cash: 5000 }), CFG, { vr: seeded });
    expect(orderLogs.length).toBeGreaterThan(0);
    // close, which missed every intraday move that brushed the band and came back.
    for (const o of orderLogs) {
      if (o.side === "buy") expect(o.price).toBeLessThan(100);
      else expect(o.price).toBeGreaterThan(100);
    }
    expect(orderLogs.every((o) => o.ordType === "limit")).toBe(true);
  });
  it("매수 사다리는 실계좌 현금 안에서만 건다(공유 계좌 안전)", async () => {
    // Buys sit below the lower band and sells above the upper - at the current price (100) none fill.
    await run(fakeBroker({ holding: 85, price: 80, cash: 200 }), CFG, { vr: seeded });
    const 매수 = orderLogs.filter((o) => o.side === "buy");
    expect(매수.length).toBeGreaterThan(0);
    expect(매수.reduce((s2, o) => s2 + o.qty * o.price, 0)).toBeLessThanOrEqual(200);
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
