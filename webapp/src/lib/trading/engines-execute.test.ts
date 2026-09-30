import { beforeEach, describe, expect, it, vi } from "vitest";

// #507·#509 — lrs/rotation/trend 가 쓰는 execute() 경로. **테스트 파일 자체가 없었다.**
// v4·VR 에는 붙여 놓고 이 셋은 "안 도는 전략" 이라 넘겼는데, 국장에서 쓸 후보가 바로 이 셋이다.
//
// 여기서 보는 것: 거부가 원장에 남는가 · 사유별로 던지는가 · dry-run 은 안 던지는가 ·
// 킬스위치가 도는 사이클을 멈추는가.

const orderLogs = vi.hoisted(() => [] as Record<string, unknown>[]);
const live = vi.hoisted(() => ({ on: true }));

vi.mock("@/models/trading-order-log", () => ({
  default: { create: vi.fn(async (d: Record<string, unknown>) => { orderLogs.push(d); }) },
}));
vi.mock("@/models/trading-portfolio", () => ({ default: { updateOne: async () => {} } }));
vi.mock("./killswitch", () => ({ isStillLive: async () => live.on }));
vi.mock("./reservation-live", () => ({ grantedCashFor: async () => null }));
vi.mock("./cap-cash", () => ({
  capLiveBroker: (b: unknown) => b, capV4Broker: (b: unknown) => b,
}));

import { runPortfolioCycle } from "./engines";

/** LRS 로 돌린다 — 레짐 온이면 전량 매수 1건을 낸다(가장 단순한 경로). */
const account = (liveEnabled = true) => ({ _id: "acc1", envKey: "paper-1", liveEnabled, broker: "kis" });
const portfolio = {
  _id: "pf1", market: "us", strategy: "lrs_v1",
  config: { signal: "QQQ", target: "TQQQ", sma: 3, band: 0 },
};

function broker(submit: () => Promise<string>) {
  return {
    market: "us" as const,
    // 시그널 종가 최신순 — 12 > sma3(10) 이라 레짐 온
    account: async () => [{}, 10_000, 0] as [Record<string, [number, number]>, number, number],
    priceOf: async () => 100,
    historyLong: async () => [["20260929", 12], ["20260928", 10], ["20260927", 10], ["20260926", 10]] as [string, number][],
    valueSeries: async () => [],
    submit,
    buyableQty: async () => 100,
  };
}

const run = (submit: () => Promise<string>, liveEnabled = true) =>
  runPortfolioCycle(account(liveEnabled) as never, portfolio as never, "run1" as never, () => {},
                    "main", { broker: broker(submit) } as never);

beforeEach(() => {
  orderLogs.length = 0;
  live.on = true;
  process.env.TRADING_LIVE_ALLOWED = "true";
});

describe("execute() — 거부를 숨기지 않는다 (lrs/rotation/trend 공용 경로)", () => {
  it("계좌 문제로 전량 거부되면 던진다", async () => {
    await expect(run(async () => { throw new Error("40910000: 모의투자 주문이 불가한 계좌입니다."); }))
      .rejects.toThrow(/증권사/);
  });

  it("휴장일 거부는 던지지 않는다 — 조치할 게 없다", async () => {
    await expect(run(async () => { throw new Error("40910001: 장운영일이 아닙니다") }))
      .resolves.toBeTypeOf("string");
  });

  it("거부도 원장에 남는다 — 예전엔 catch 가 기록까지 건너뛰어 흔적이 0이었다", async () => {
    await run(async () => { throw new Error("40910001: 장운영일이 아닙니다") });
    expect(orderLogs.length).toBeGreaterThan(0);
    expect(orderLogs[0].orderNo).toBe("");
    expect(String(orderLogs[0].reason)).toContain("40910001");
  });

  it("접수되면 주문번호가 원장에 남는다", async () => {
    await run(async () => "ORD9");
    expect(orderLogs[0].orderNo).toBe("ORD9");
  });

  it("dry-run 은 거부가 없어도 던지지 않는다", async () => {
    await expect(run(async () => { throw new Error("안 불림") }, false))
      .resolves.toBeTypeOf("string");
  });
});

describe("execute() — 킬스위치가 도는 사이클을 멈춘다 (#509)", () => {
  it("주문 직전 재확인이 꺼진 상태를 잡으면 전송하지 않는다", async () => {
    live.on = false;
    let called = 0;
    await run(async () => { called++; return "ORD1"; });
    expect(called).toBe(0); // 브로커까지 가지 않는다
  });
});
