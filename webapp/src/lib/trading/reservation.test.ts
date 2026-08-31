import { describe, it, expect } from "vitest";
import { planReservations, usableCash, type ReservationBlock } from "./reservation";

const blocks = (...specs: [string, number | null | undefined][]): ReservationBlock[] =>
  specs.map(([id, reserved]) => ({ id, reserved: reserved ?? undefined }));

const byId = (accountCash: number, bs: ReservationBlock[]) =>
  Object.fromEntries(planReservations(accountCash, bs).map((r) => [r.id, r]));

describe("usableCash — 한 블록이 볼 수 있는 돈", () => {
  it("예약이 없으면 전액 — 지금까지의 동작 그대로", () => {
    expect(usableCash(50_000, undefined)).toBe(50_000);
    expect(usableCash(50_000, 0)).toBe(50_000);
    expect(usableCash(50_000, null)).toBe(50_000);
  });

  it("예약이 있으면 그만큼만", () => {
    expect(usableCash(50_000, 30_000)).toBe(30_000);
  });

  it("예약이 현금보다 크면 현금까지만 — 없는 돈을 보여 주면 안 된다", () => {
    expect(usableCash(10_000, 30_000)).toBe(10_000);
  });

  it("현금이 음수여도 0 아래로 내려가지 않는다", () => {
    expect(usableCash(-5, 30_000)).toBe(0);
    expect(usableCash(-5, undefined)).toBe(0);
  });
});

describe("planReservations — 여러 블록에 나눠 준다", () => {
  it("블록이 하나면 그대로", () => {
    const got = byId(50_000, blocks(["a", 30_000]));
    expect(got.a).toMatchObject({ granted: 30_000, held: false });
  });

  it("앞에서부터 선점한다 — 만든 순서가 우선권이다", () => {
    const got = byId(50_000, blocks(["a", 30_000], ["b", 20_000]));
    expect(got.a.granted).toBe(30_000);
    expect(got.b.granted).toBe(20_000);
  });

  it("모자라면 뒤 블록은 남은 만큼만", () => {
    // 현금 40,000 인데 30,000 + 20,000 을 예약했다.
    const got = byId(40_000, blocks(["a", 30_000], ["b", 20_000]));
    expect(got.a.granted).toBe(30_000);
    expect(got.b.granted).toBe(10_000);
    expect(got.b.short).toBe(true); // 원하던 만큼 못 받았다
  });

  it("남은 돈이 없으면 그날 보류", () => {
    const got = byId(30_000, blocks(["a", 30_000], ["b", 20_000]));
    expect(got.a.granted).toBe(30_000);
    expect(got.b).toMatchObject({ granted: 0, held: true });
  });

  it("예약이 빈 블록은 그 시점 잔여 전액", () => {
    const got = byId(50_000, blocks(["a", 30_000], ["b", undefined]));
    expect(got.b.granted).toBe(20_000);
  });

  it("예약 빈 블록이 앞에 있으면 다 가져간다 — 뒤가 보류된다", () => {
    // 전액을 쓰겠다는 블록을 앞에 두면 뒤에 남는 게 없다. 순서가 곧 우선권이다.
    const got = byId(50_000, blocks(["a", undefined], ["b", 20_000]));
    expect(got.a.granted).toBe(50_000);
    expect(got.b).toMatchObject({ granted: 0, held: true });
  });

  it("순서를 바꾸면 결과가 바뀐다", () => {
    const 앞뒤 = byId(40_000, blocks(["a", 30_000], ["b", 20_000]));
    const 뒤앞 = byId(40_000, blocks(["b", 20_000], ["a", 30_000]));
    expect(앞뒤.a.granted).toBe(30_000);
    expect(뒤앞.a.granted).toBe(20_000);
  });

  it("현금이 0 이면 전부 보류", () => {
    const got = byId(0, blocks(["a", 30_000], ["b", undefined]));
    expect(got.a.held).toBe(true);
    expect(got.b.held).toBe(true);
  });

  it("합이 현금 이하면 아무도 모자라지 않는다", () => {
    const rows = planReservations(100_000, blocks(["a", 30_000], ["b", 20_000]));
    expect(rows.every((r) => !r.short && !r.held)).toBe(true);
  });

  it("음수·이상한 예약은 없는 것으로 본다", () => {
    const got = byId(50_000, blocks(["a", -100], ["b", 20_000]));
    expect(got.a.granted).toBe(50_000); // 전액 취급
    expect(got.b.held).toBe(true);
  });

  it("블록이 없으면 빈 결과", () => {
    expect(planReservations(50_000, [])).toEqual([]);
  });

  it("나눠 준 합이 현금을 넘지 않는다 — 이게 이 함수의 존재 이유다", () => {
    for (const cash of [0, 10_000, 40_000, 50_000, 999_999]) {
      const rows = planReservations(cash, blocks(["a", 30_000], ["b", 20_000], ["c", undefined]));
      const sum = rows.reduce((s, r) => s + r.granted, 0);
      expect(sum, `현금 ${cash}`).toBeLessThanOrEqual(Math.max(cash, 0));
    }
  });
});
