import { describe, expect, it } from "vitest";
import { planStateReset } from "./state-reset";

// #513 — 계좌를 갈면 브로커 보유는 0인데 전략 상태는 포트폴리오에 그대로 남는다.
// reconcileDay 는 **매도 체결이 있을 때만** 사이클을 리셋하므로 자동으로는 안 풀린다.
//
// 여기서 보는 것: 무엇을 지우는가 · 무엇을 남기는가 · 되돌릴 수 있는가 · 두 번 돌려도 안전한가.

/** 실제 DB 에 있던 값 그대로 — 모양이 바뀌면 여기가 먼저 깨지라고 */
const V4 = {
  symbol: "TQQQ", splits: 20, cycleCash: 81188.44600123, t: 3.0895410618212704,
  mode: "normal", entryLimit: 0, reverseFirstDay: false, recoverConfirmed: false,
  lastRunDate: "20260929",
  pending: { one: 4801.078805610114, q25: 51, q75: 153, reverseSell: 0, reverseFirst: false },
};
const VR = {
  qty: 51, pool: 3029.163, V: 6895.145969980488, buyBudget: 804.3565,
  sinceCycle: 9, cumBuy: 6767.36, cumSell: 1796.523, symbol: "SOXL",
  vInit: true, lastRunDate: "20260928",
};

const AT = "2026-09-30T14:00:00.000Z";
const opts = { at: AT, reason: "계좌 교체" };

describe("planStateReset — 무엇을 지우는가", () => {
  it("v4 상태를 지운다 — t 가 살아남으면 보유 0인 계좌에서 3회차인 척한다", () => {
    const p = planStateReset({ v4: V4 }, opts);
    expect(p.cleared).toEqual(["v4"]);
    expect(p.patch).toBeDefined();
    expect((p.patch!.state as Record<string, unknown>).v4).toBeUndefined();
  });

  it("v4·vr 이 함께 있으면 둘 다 지운다 — 한 계정에 블록이 여럿이다", () => {
    const p = planStateReset({ v4: V4, vr: VR }, opts);
    expect(p.cleared.sort()).toEqual(["v4", "vr"]);
  });

  it("모르는 전략 키도 지운다 — 새 전략이 생겨도 목록을 고칠 필요가 없다", () => {
    const p = planStateReset({ rotation: { pool: ["A"] } }, opts);
    expect(p.cleared).toEqual(["rotation"]);
  });

  it("상태가 비어 있으면 아무것도 안 한다 — patch 가 없어야 한다", () => {
    const p = planStateReset({}, opts);
    expect(p.cleared).toEqual([]);
    expect(p.patch).toBeUndefined();
    expect(p.skipped).toBeTruthy();
  });

  it("state 자체가 없어도 던지지 않는다", () => {
    expect(planStateReset(undefined, opts).cleared).toEqual([]);
    expect(planStateReset(null, opts).cleared).toEqual([]);
  });
});

describe("planStateReset — 되돌릴 수 있어야 한다 (소프트 삭제)", () => {
  it("지운 값이 archive 에 원본 그대로 남는다", () => {
    const p = planStateReset({ v4: V4 }, opts);
    const archive = (p.patch!.state as { archive: { at: string; reason: string; state: unknown }[] }).archive;
    expect(archive).toHaveLength(1);
    expect(archive[0].at).toBe(AT);
    expect(archive[0].reason).toBe("계좌 교체");
    expect(archive[0].state).toEqual({ v4: V4 }); // 값 하나도 안 잃는다
  });

  it("archive 는 지우지 않고 쌓는다 — 두 번째 교체 이력이 첫 번째를 덮으면 안 된다", () => {
    const prior = [{ at: "2026-01-01T00:00:00.000Z", reason: "옛날", state: { v4: { t: 1 } } }];
    const p = planStateReset({ v4: V4, archive: prior }, opts);
    expect(p.cleared).toEqual(["v4"]); // archive 자체는 지울 대상이 아니다
    const archive = (p.patch!.state as { archive: unknown[] }).archive;
    expect(archive).toHaveLength(2);
    expect(archive[0]).toEqual(prior[0]); // 오래된 것이 앞
  });

  it("archive 가 무한정 자라지 않는다 — 오래된 것부터 버린다", () => {
    const prior = Array.from({ length: 10 }, (_, i) => ({
      at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`, reason: `r${i}`, state: {},
    }));
    const p = planStateReset({ v4: V4, archive: prior }, { ...opts, keepArchive: 10 });
    const archive = (p.patch!.state as { archive: { reason: string }[] }).archive;
    expect(archive).toHaveLength(10);
    expect(archive[0].reason).toBe("r1");        // r0 가 밀려났다
    expect(archive.at(-1)!.reason).toBe("계좌 교체");
  });

  it("지울 것이 없으면 archive 에도 안 쌓는다 — 두 번 돌려도 이력이 더러워지지 않는다", () => {
    const prior = [{ at: AT, reason: "계좌 교체", state: { v4: V4 } }];
    const p = planStateReset({ archive: prior }, opts);
    expect(p.cleared).toEqual([]);
    expect(p.patch).toBeUndefined();
  });
});

describe("planStateReset — 순수해야 한다", () => {
  it("입력을 건드리지 않는다", () => {
    const state = { v4: { ...V4 }, archive: [] as unknown[] };
    const snapshot = JSON.parse(JSON.stringify(state));
    planStateReset(state, opts);
    expect(state).toEqual(snapshot);
  });
});
