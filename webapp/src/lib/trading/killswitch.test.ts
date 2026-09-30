import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancellableOrders } from "./killswitch";

// #509·#498 — 킬스위치. 여기서 못박는 건 **무엇을 거두고 무엇을 안 거두는가** 다.
// 계좌 전체 미체결로 취소하면 사람이 HTS 에서 낸 주문까지 지운다 — 그래서 우리 원장만 본다.

const NOW = new Date("2026-09-30T13:00:00Z"); // KST 22:00 · ET 09:00
const log = (o: Partial<Parameters<typeof cancellableOrders>[0][number]>) => ({
  envKey: "paper-1", market: "us", symbol: "TQQQ", orderNo: "A1",
  ordType: "loc", dryRun: false, createdAt: NOW, qty: 1, ...o,
});

describe("cancellableOrders — 거둘 것만 고른다", () => {
  it("오늘 낸 지정가·LOC 를 고른다", () => {
    expect(cancellableOrders([log({ ordType: "loc" }), log({ orderNo: "A2", ordType: "limit" })], NOW))
      .toHaveLength(2);
  });

  it("dry-run 은 건드리지 않는다 — 실제로 나간 적이 없다", () => {
    expect(cancellableOrders([log({ dryRun: true })], NOW)).toEqual([]);
  });

  it("거부된 주문은 거둘 것이 없다(orderNo 없음)", () => {
    expect(cancellableOrders([log({ orderNo: "" })], NOW)).toEqual([]);
  });

  it("시장가는 이미 체결됐다 — 취소 대상이 아니다", () => {
    expect(cancellableOrders([log({ ordType: "market" })], NOW)).toEqual([]);
  });

  it("어제 주문은 안 건드린다 — LOC 는 종가에 자동 소멸했다", () => {
    const 어제 = new Date(NOW.getTime() - 24 * 3600_000);
    expect(cancellableOrders([log({ createdAt: 어제 })], NOW)).toEqual([]);
  });

  it("같은 주문번호가 여러 번 기록돼도 한 번만 취소한다(재푸시)", () => {
    expect(cancellableOrders([log({}), log({}), log({ orderNo: "A2" })], NOW)).toHaveLength(2);
  });

  it("다른 계정의 같은 주문번호는 서로 다른 주문이다", () => {
    expect(cancellableOrders([log({}), log({ envKey: "real-2" })], NOW)).toHaveLength(2);
  });

  it("시장 tz 로 '오늘' 을 판단한다 — KST 22:00 은 ET 로 같은 날 09:00", () => {
    // 국장 기준으로는 9/30, 미장 기준으로도 9/30 이라 둘 다 오늘이다.
    expect(cancellableOrders([log({ market: "kr" }), log({ market: "us", orderNo: "A2" })], NOW))
      .toHaveLength(2);
  });

  it("빈 목록도 던지지 않는다", () => {
    expect(cancellableOrders([], NOW)).toEqual([]);
  });
});

// ── killSwitch() 본체 — 비상 정지의 순서와 실패 격리를 못박는다 ──────────────
//
// 이게 제일 중요한 안전장치인데 처음엔 테스트를 안 붙였다. cancellableOrders 만 검증하고
// "킬스위치 테스트 있다" 고 넘어갈 뻔했다 — 정작 순서(차단 먼저)도 실패 격리도 안 봤다.

const mockAccounts = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], updated: [] as unknown[] }));
const mockLogs = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
const calls = vi.hoisted(() => ({ order: [] as string[] })); // 호출 순서를 기록한다

vi.mock("@/models/trading-account", () => ({
  default: {
    find: () => ({ lean: async () => mockAccounts.rows }),
    updateMany: async (q: unknown, u: unknown) => {
      calls.order.push("disable");
      mockAccounts.updated.push(u);
    },
    findById: () => ({ select: () => ({ lean: async () => mockAccounts.rows[0] ?? null }) }),
  },
}));
vi.mock("@/models/trading-order-log", () => ({
  default: { find: () => ({ sort: () => ({ lean: async () => mockLogs.rows }) }) },
}));

const { killSwitch, isStillLive } = await import("./killswitch");

describe("killSwitch — 차단이 먼저, 취소는 그다음", () => {
  beforeEach(() => {
    mockAccounts.rows = [{ _id: "a1", envKey: "paper-1", liveEnabled: true }];
    mockAccounts.updated = [];
    mockLogs.rows = [];
    calls.order = [];
  });

  it("실주문을 먼저 끈다 — 취소가 30초 걸려도 그 사이 신규 주문은 안 나간다", async () => {
    mockLogs.rows = [log({}), log({ orderNo: "A2" })] as never[];
    await killSwitch({ now: NOW, cancel: async () => { calls.order.push("cancel"); } });
    expect(calls.order[0]).toBe("disable");
    expect(calls.order.slice(1)).toEqual(["cancel", "cancel"]);
  });

  it("끈 계정을 결과로 돌려준다", async () => {
    const r = await killSwitch({ now: NOW, cancel: async () => {} });
    expect(r.disabled).toEqual(["paper-1"]);
  });

  it("켜진 계정이 없으면 차단을 건너뛴다", async () => {
    mockAccounts.rows = [];
    const r = await killSwitch({ now: NOW, cancel: async () => {} });
    expect(r.disabled).toEqual([]);
    expect(calls.order).toEqual([]);
  });

  it("한 건이 실패해도 나머지를 계속 취소한다 — 실패도 결과에 담는다", async () => {
    mockLogs.rows = [log({ orderNo: "A1" }), log({ orderNo: "A2" }), log({ orderNo: "A3" })] as never[];
    const r = await killSwitch({
      now: NOW,
      cancel: async (o) => { if (o.orderNo === "A2") throw new Error("이미 체결됨"); },
    });
    expect(r.cancelled.map((c) => c.orderNo)).toEqual(["A1", "A3"]);
    expect(r.failed).toEqual([{ orderNo: "A2", error: "이미 체결됨" }]);
    expect(r.scanned).toBe(3);
  });

  it("취소할 것이 없어도 차단은 한다", async () => {
    const r = await killSwitch({ now: NOW, cancel: async () => {} });
    expect(r.disabled).toEqual(["paper-1"]);
    expect(r.scanned).toBe(0);
  });
});

describe("isStillLive — 주문 직전 재확인", () => {
  beforeEach(() => { process.env.TRADING_LIVE_ALLOWED = "true"; });

  it("계정이 켜져 있으면 true", async () => {
    mockAccounts.rows = [{ _id: "a1", liveEnabled: true }];
    expect(await isStillLive("a1")).toBe(true);
  });

  it("킬스위치로 꺼졌으면 false — 도는 사이클이 여기서 멈춘다", async () => {
    mockAccounts.rows = [{ _id: "a1", liveEnabled: false }];
    expect(await isStillLive("a1")).toBe(false);
  });

  it("서버 게이트가 닫혀 있으면 계정과 무관하게 false", async () => {
    mockAccounts.rows = [{ _id: "a1", liveEnabled: true }];
    process.env.TRADING_LIVE_ALLOWED = "false";
    expect(await isStillLive("a1")).toBe(false);
  });

  it("계정을 못 찾으면 false — 모르면 안 낸다", async () => {
    mockAccounts.rows = [];
    expect(await isStillLive("없는id")).toBe(false);
  });
});
