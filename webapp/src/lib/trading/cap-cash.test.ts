import { describe, it, expect, vi } from "vitest";
import { capLiveBroker, capV4Broker } from "./cap-cash";
import type { LiveBroker } from "./engines";
import type { V4Broker } from "./infinite-v4-engine";

const holdings: Record<string, [number, number]> = { TQQQ: [599, 72.5] };

function liveBroker(cash: number): LiveBroker {
  return {
    market: "us",
    account: vi.fn().mockResolvedValue([holdings, cash, 123_456]),
    priceOf: vi.fn().mockResolvedValue(72.5),
    historyLong: vi.fn().mockResolvedValue([["2026-08-28", 72.5]]),
    valueSeries: vi.fn().mockResolvedValue([1, 2, 3]),
    submit: vi.fn().mockResolvedValue("ORDER-1"),
    buyableQty: vi.fn().mockResolvedValue(400),
  };
}

function v4Broker(cash: number): V4Broker {
  return {
    snapshot: vi.fn().mockResolvedValue({ holding: 599, avg: 70, price: 72.5, cash }),
    historyLong: vi.fn().mockResolvedValue([["2026-08-28", 72.5]]),
    executions: vi.fn().mockResolvedValue([]),
    openOrders: vi.fn().mockResolvedValue([]),
    cancel: vi.fn().mockResolvedValue(undefined),
    place: vi.fn().mockResolvedValue("ORDER-1"),
  };
}

describe("capLiveBroker", () => {
  it("예약만큼만 현금을 보여 준다", async () => {
    const [, cash] = await capLiveBroker(liveBroker(50_000), 30_000).account();
    expect(cash).toBe(30_000);
  });

  it("보유와 증권사 평가금액은 그대로 — 현금만 줄인다", async () => {
    const [h, , equity] = await capLiveBroker(liveBroker(50_000), 30_000).account();
    expect(h).toEqual(holdings);
    expect(equity).toBe(123_456);
  });

  it("예약이 없으면 원래 브로커를 그대로 쓴다", async () => {
    const inner = liveBroker(50_000);
    expect(capLiveBroker(inner, null)).toBe(inner);
    expect(capLiveBroker(inner, undefined)).toBe(inner);
  });

  it("예약이 계좌 현금보다 크면 계좌 현금까지만", async () => {
    const [, cash] = await capLiveBroker(liveBroker(10_000), 30_000).account();
    expect(cash).toBe(10_000);
  });

  it("나머지 기능은 그대로 위임한다", async () => {
    const inner = liveBroker(50_000);
    const capped = capLiveBroker(inner, 30_000);

    expect(capped.market).toBe("us");
    expect(await capped.priceOf("TQQQ")).toBe(72.5);
    expect(await capped.buyableQty("TQQQ", 72.5)).toBe(400);
    expect(await capped.submit("TQQQ", 1, "buy", 72.5)).toBe("ORDER-1");
    expect(await capped.valueSeries("TQQQ")).toEqual([1, 2, 3]);
    expect(inner.submit).toHaveBeenCalledWith("TQQQ", 1, "buy", 72.5);
  });
});

describe("capV4Broker", () => {
  it("snapshot 의 현금만 줄인다", async () => {
    const snap = await capV4Broker(v4Broker(50_000), 30_000).snapshot("TQQQ");
    expect(snap.cash).toBe(30_000);
    // 보유·평단·현재가는 계좌의 사실이라 건드리지 않는다.
    expect(snap).toMatchObject({ holding: 599, avg: 70, price: 72.5 });
  });

  it("예약이 없으면 원래 브로커 그대로", () => {
    const inner = v4Broker(50_000);
    expect(capV4Broker(inner, null)).toBe(inner);
  });

  it("주문·체결·취소는 그대로 위임한다", async () => {
    const inner = v4Broker(50_000);
    const capped = capV4Broker(inner, 30_000);

    await capped.executions("TQQQ", "20260827", "20260828");
    await capped.openOrders("TQQQ");
    await capped.cancel("TQQQ", "ORDER-9", 1);
    expect(await capped.place("TQQQ", { qty: 1 } as never)).toBe("ORDER-1");

    expect(inner.executions).toHaveBeenCalledWith("TQQQ", "20260827", "20260828");
    expect(inner.cancel).toHaveBeenCalledWith("TQQQ", "ORDER-9", 1);
  });

  it("현금이 음수인 계좌도 0 아래로 안 내려간다", async () => {
    const snap = await capV4Broker(v4Broker(-100), 30_000).snapshot("TQQQ");
    expect(snap.cash).toBe(0);
  });
});
