import { describe, it, expect } from "vitest";
import { snapshotOf, changedKeys } from "./portfolio-revision";

const base = {
  market: "us", strategy: "infinite_v4", runAt: "09:35",
  weekdaysOnly: true, enabled: true, reservedCash: 0,
  config: { symbol: "TQQQ", principal: 93300, splits: 20 },
};

describe("snapshotOf — 설정만 뽑는다", () => {
  it("엔진이 매 실행마다 고치는 state 는 절대 안 담는다", () => {
    // 담으면 설정을 안 건드린 날도 리비전이 쌓여 이력이 쓸모없어진다. 이 기능의 전제다.
    const snap = snapshotOf({ ...base, state: { v4: { t: 9.28, cycleCash: 49785.81 } } });
    expect(snap).not.toHaveProperty("state");
  });

  it("_id·타임스탬프·소프트삭제 플래그도 안 담는다 — 설정이 아니다", () => {
    const snap = snapshotOf({
      ...base, _id: "abc", createdAt: new Date(), updatedAt: new Date(),
      isDeleted: false, deletedAt: null, accountId: "acc-1",
    });
    expect(Object.keys(snap).sort()).toEqual(
      ["config", "enabled", "market", "reservedCash", "runAt", "strategy", "weekdaysOnly"]);
  });

  it("없는 값은 기본값으로 채운다 — 옛 문서에도 스냅샷이 온전하다", () => {
    const snap = snapshotOf({ market: "kr", strategy: "trend_v1", runAt: "15:40" });
    expect(snap.weekdaysOnly).toBe(true);
    expect(snap.enabled).toBe(true);
    expect(snap.reservedCash).toBe(0);
    expect(snap.config).toEqual({});
  });
});

describe("changedKeys — 안 바뀌면 빈 배열", () => {
  it("같은 값이면 아무것도 안 나온다", () => {
    // 저장 버튼만 눌러도 upsert 가 도므로 이게 무너지면 이력이 같은 줄로 도배된다.
    expect(changedKeys(snapshotOf(base), snapshotOf({ ...base }))).toEqual([]);
  });

  it("config 는 키 순서가 달라도 같은 것으로 본다", () => {
    const a = snapshotOf(base);
    const b = snapshotOf({ ...base, config: { splits: 20, principal: 93300, symbol: "TQQQ" } });
    expect(changedKeys(a, b)).toEqual([]);
  });

  it("바뀐 키만 집어낸다", () => {
    const a = snapshotOf(base);
    const b = snapshotOf({ ...base, strategy: "value_rebalancing", runAt: "15:50" });
    expect(changedKeys(a, b).sort()).toEqual(["runAt", "strategy"]);
  });

  it("config 안쪽 값만 바뀌어도 잡는다 — #348 이 이 경우였다", () => {
    const a = snapshotOf(base);
    const b = snapshotOf({ ...base, config: { ...base.config, principal: 200 } });
    expect(changedKeys(a, b)).toEqual(["config"]);
  });

  it("config 의 키가 늘거나 줄어도 잡는다", () => {
    const a = snapshotOf(base);
    expect(changedKeys(a, snapshotOf({ ...base, config: { ...base.config, starBase: 15 } })))
      .toEqual(["config"]);
    expect(changedKeys(a, snapshotOf({ ...base, config: { symbol: "TQQQ", principal: 93300 } })))
      .toEqual(["config"]);
  });

  it("중첩 객체·배열도 깊이 본다", () => {
    const a = snapshotOf({ ...base, config: { universe: ["A", "B"], opt: { x: 1 } } });
    expect(changedKeys(a, snapshotOf({ ...base, config: { universe: ["A", "B"], opt: { x: 1 } } })))
      .toEqual([]);
    expect(changedKeys(a, snapshotOf({ ...base, config: { universe: ["A", "C"], opt: { x: 1 } } })))
      .toEqual(["config"]);
    expect(changedKeys(a, snapshotOf({ ...base, config: { universe: ["A", "B"], opt: { x: 2 } } })))
      .toEqual(["config"]);
  });

  it("enabled 가 꺼졌다 켜진 것도 한 줄로 남는다", () => {
    const off = snapshotOf({ ...base, enabled: false });
    expect(changedKeys(off, snapshotOf(base))).toEqual(["enabled"]);
  });
});
