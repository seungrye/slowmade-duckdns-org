import { beforeEach, describe, expect, it, vi } from "vitest";

// #509 — 킬스위치 라우트. 여기서 보는 건 **취소가 올바른 브로커·거래소로 가는가** 다.
// 순수 로직(무엇을 거두나·순서)은 killswitch.test.ts 가 본다.
//
// 미장 취소는 종목 거래소로 보내야 잡힌다 — NASD 고정이면 AMEX 상장 SOXL 취소가 조용히
// 실패한다(#489 와 같은 함정). 그걸 이 테스트가 못박는다.

const calls = vi.hoisted(() => ({
  krCancel: [] as unknown[], usCancel: [] as unknown[], tossCancel: [] as unknown[],
  liveLog: [] as unknown[],
}));
const state = vi.hoisted(() => ({
  accounts: [] as Record<string, unknown>[],
  cancelTargets: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/require-owner", () => ({ requireOwner: async () => ({ email: "me@x.com" }) }));
vi.mock("@/lib/db", () => ({ connectToDB: async () => {} }));
vi.mock("@/models/trading-account", () => ({
  default: {
    find: () => ({ lean: async () => state.accounts }),
    updateOne: async (_q: unknown, u: unknown) => { calls.liveLog.push(u); },
  },
}));
// killSwitch 는 순수 테스트가 따로 있다 — 여기선 cancel 콜백만 실행해 배선을 본다.
vi.mock("@/lib/trading/killswitch", () => ({
  killSwitch: async (o: { cancel: (t: unknown) => Promise<void>; log?: (s: string) => void }) => {
    // 실제 killSwitch 와 같이 **건별로 격리**한다 — 한 건 실패가 나머지를 막지 않는다.
    const failed: { orderNo: string; error: string }[] = [];
    for (const t of state.cancelTargets) {
      try { await o.cancel(t); }
      catch (e) { failed.push({ orderNo: String((t as { orderNo: string }).orderNo),
                                error: e instanceof Error ? e.message : String(e) }); }
    }
    return { disabled: state.accounts.map((a) => String(a.envKey)),
             cancelled: [], failed, scanned: state.cancelTargets.length };
  },
}));
vi.mock("@/lib/trading/engines", () => ({
  makeKisClient: () => ({
    krCancelOrder: async (...a: unknown[]) => { calls.krCancel.push(a); return "OK"; },
    usCancelOrder: async (...a: unknown[]) => { calls.usCancel.push(a); return "OK"; },
  }),
  makeTossClient: () => ({
    cancelOrder: async (...a: unknown[]) => { calls.tossCancel.push(a); return "OK"; },
  }),
}));

import { POST } from "./route";

const acct = (over: Record<string, unknown> = {}) => ({
  _id: "a1", envKey: "paper-1", broker: "kis", liveEnabled: true, liveLog: [], ...over,
});
const target = (over: Record<string, unknown> = {}) => ({
  envKey: "paper-1", market: "us", symbol: "TQQQ", orderNo: "A1", qty: 3, ...over,
});

beforeEach(() => {
  calls.krCancel.length = 0; calls.usCancel.length = 0;
  calls.tossCancel.length = 0; calls.liveLog.length = 0;
  state.accounts = [acct()];
  state.cancelTargets = [];
});

describe("kill route — 취소가 올바른 곳으로 간다", () => {
  it("국장은 krCancelOrder 로 (주문번호·수량)", async () => {
    state.cancelTargets = [target({ market: "kr", symbol: "069500", orderNo: "K1", qty: 5 })];
    await POST();
    expect(calls.krCancel).toEqual([["K1", 5]]);
    expect(calls.usCancel).toEqual([]);
  });

  it("미장 AMEX 종목(SOXL)은 AMEX 로 취소한다 — NASD 고정이면 조용히 실패한다", async () => {
    state.cancelTargets = [target({ symbol: "SOXL", orderNo: "U1", qty: 2 })];
    await POST();
    expect(calls.usCancel).toEqual([["SOXL", "U1", 2, "AMEX"]]);
  });

  it("나스닥 종목(TQQQ)은 NASD", async () => {
    state.cancelTargets = [target({ symbol: "TQQQ", orderNo: "U2", qty: 1 })];
    await POST();
    expect(calls.usCancel).toEqual([["TQQQ", "U2", 1, "NASD"]]);
  });

  it("토스 계정은 토스 취소로 간다", async () => {
    state.accounts = [acct({ broker: "toss", envKey: "toss-1" })];
    state.cancelTargets = [target({ envKey: "toss-1", orderNo: "T1" })];
    await POST();
    expect(calls.tossCancel).toEqual([["T1"]]);
    expect(calls.usCancel).toEqual([]);
  });

  it("모르는 계정이면 그 건만 실패하고 전체를 막지 않는다", async () => {
    state.cancelTargets = [target({ envKey: "없는계정" })];
    const res = await POST();
    expect(res.status).toBe(200); // killSwitch 가 건별로 격리한다
  });
});

describe("kill route — 감사 기록", () => {
  it("끈 계정마다 liveLog 를 남긴다 — 누가 껐는지 알아야 한다", async () => {
    await POST();
    expect(calls.liveLog).toHaveLength(1);
  });

  it("끈 계정이 없으면 기록도 없다", async () => {
    state.accounts = [];
    await POST();
    expect(calls.liveLog).toEqual([]);
  });
});
