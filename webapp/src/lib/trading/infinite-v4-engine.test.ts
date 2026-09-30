import { beforeEach, describe, expect, it, vi } from "vitest";

// 모델·시계 목킹 — DB/네트워크 없이 엔진 오케스트레이션만 본다(VR 엔진 테스트와 같은 방식).
const persisted: Array<Record<string, unknown>> = [];
const orderLogs: Array<Record<string, unknown>> = [];
vi.mock("@/models/trading-order-log", () => ({
  default: { create: vi.fn(async (d: Record<string, unknown>) => { orderLogs.push(d); }) },
}));
vi.mock("@/models/trading-portfolio", () => ({
  default: {
    updateOne: vi.fn(async (_q: unknown, u: { $set: Record<string, unknown> }) => {
      persisted.push(u.$set["state.v4"] as Record<string, unknown>);
    }),
  },
}));
vi.mock("./engines", () => ({ marketToday: () => "20260922" }));

import { makeV4KisBroker, prevMarketDay, runInfiniteV4, type V4Broker } from "./infinite-v4-engine";
import { discardState } from "./state-saver";
import { emptyPending, newV4State, type V4Pending, type V4State } from "./infinite-v4-state";

// 대사(reconcile) 날짜경계 회귀 방지 — lastRunDate 를 '어제'로 남기는 규칙 검증.
// 버그: lastRunDate=today 로 남기면 필터 `lastRunDate < date < today`(strict)가 매일 비어
// 전일 종가 LOC 체결이 영영 대사되지 않아 T·cycleCash 가 얼어붙는다.

describe("infinite-v4-engine.prevMarketDay", () => {
  it("하루 전(같은 달)", () => {
    expect(prevMarketDay("20260720")).toBe("20260719");
  });
  it("월 경계", () => {
    expect(prevMarketDay("20260701")).toBe("20260630");
  });
  it("연 경계", () => {
    expect(prevMarketDay("20260101")).toBe("20251231");
  });
  it("윤년 2월", () => {
    expect(prevMarketDay("20240301")).toBe("20240229");
  });
});

describe("infinite-v4-engine 대사 윈도우 경계 불변식", () => {
  // 엔진 필터: lastRunDate < fillDate < today (양쪽 strict).
  const inWindow = (lastRunDate: string, fillDate: string, today: string) =>
    lastRunDate < fillDate && fillDate < today;

  it("전일 실행이 lastRunDate=어제 를 남기면, 그 전일(오늘) 종가 체결이 다음 실행 창에 포함된다", () => {
    // Day D 실행: 종가 LOC 체결 dated D. 실행 끝에 lastRunDate = prevMarketDay(D) = D-1.
    const dayD = "20260720";
    const lastRunAfterD = prevMarketDay(dayD); // "20260719"
    const fillOnD = dayD; // LOC 는 그날 종가 체결 → 체결일 == 실행일

    // Day D+1 실행: today = D+1, 필터 창에 D 체결이 잡혀야 대사가 이어진다.
    const dayD1 = "20260721";
    expect(inWindow(lastRunAfterD, fillOnD, dayD1)).toBe(true);
  });

  it("(버그 재현) lastRunDate=today 로 남기면 전일 체결이 다음 창에서 누락된다", () => {
    const dayD = "20260720";
    const lastRunBuggy = dayD; // 옛 코드: lastRunDate = today
    const fillOnD = dayD;
    const dayD1 = "20260721";
    // `20260720 < 20260720` false → 영영 누락(장부 정지).
    expect(inWindow(lastRunBuggy, fillOnD, dayD1)).toBe(false);
  });

  it("2단계 동일일(sell→buy): sell 이 어제로 올리면 buy 창은 비어 중복반영이 없다", () => {
    const dayD = "20260720";
    // sell(09:30) 끝: lastRunDate = prevMarketDay(D) = D-1.
    const afterSell = prevMarketDay(dayD); // "20260719"
    // buy(15:20) 대사 창: afterSell < date < today(D) → date ∈ {D-1} 뿐, D-1 은 이미 반영됨.
    // 오늘(D) 체결은 아직 없고, 있어도 date==today 라 strict 로 제외 → 중복 없음.
    expect(inWindow(afterSell, dayD, dayD)).toBe(false); // 오늘 체결은 제외
    expect(inWindow(afterSell, prevMarketDay(dayD), dayD)).toBe(false); // 어제는 이미 반영(strict 좌)
  });
});

// #483 — 국장은 하루가 sell(09:30)+buy(15:20) 두 사이클이다. buy 가 pending 을 새로 만들어
// 통째로 저장하면 sell 이 적어 둔 q75(¾ 익절 예약)가 사라지고, 다음 날 대사가 그 체결을
// q25 로 잘못 읽어 T 를 ×0.25 대신 ×0.75 한다.
describe("infinite-v4-engine — 국장 2단계 phase 의 pending 보존", () => {
  const CFG = { symbol: "069500", principal: 10_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-1", liveEnabled: false };

  function broker(o: { holding: number; avg: number; price: number; cash: number }): V4Broker {
    return {
      snapshot: async () => ({ holding: o.holding, avg: o.avg, price: o.price, cash: o.cash }),
      historyLong: async () => [],
      executions: async () => [],
      openOrders: async () => [],
      cancel: async () => {},
      place: async () => "ORD1",
    };
  }
  // 보유 32 · 평단 100 · 현재가 110 → q25=8 / q75=24, 별지점 104.60(현재가 이하라 buy phase 통과)
  const b = broker({ holding: 32, avg: 100, price: 110, cash: 6_000 });
  const seed: V4State = {
    ...newV4State("069500", 20, 10_000),
    t: 6.93, cycleCash: 6_000, lastRunDate: "20260921", pending: emptyPending(),
  };
  const run = (phase: "both" | "sell" | "buy", state: V4State, market = "kr") =>
    runInfiniteV4(
      account as never,
      { _id: "pf1", market, strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
      "run1" as never, b, phase, () => {},
    );
  const pendOf = (i: number) => persisted[i].pending as V4Pending;

  beforeEach(() => { persisted.length = 0; });

  it("sell(09:30) 이 ¾ 익절 예약(q75)을 적는다", async () => {
    await run("sell", seed);
    expect(pendOf(0).q75).toBe(24);
    expect(pendOf(0).q25).toBe(0); // ¼ LOC 매도는 buy phase 몫
  });

  it("buy(15:20) 가 돌아도 q75 가 살아남는다 — ¼ 예약만 더해진다", async () => {
    await run("sell", seed);
    await run("buy", persisted[0] as unknown as V4State);
    expect(pendOf(1).q25).toBe(8);
    expect(pendOf(1).q75).toBe(24); // 지워지면 다음 날 T 가 ×0.75 로 틀어진다
  });

  it("미장 both 는 한 사이클에서 q25·q75 를 함께 적는다(회귀 없음)", async () => {
    await run("both", { ...seed, symbol: "TQQQ" }, "us");
    expect(pendOf(0)).toMatchObject({ q25: 8, q75: 24 });
  });
});

// #489 — 주문은 종목 거래소(usExcd)로 나가는데 미체결 조회만 기본 NASD 였다. 어긋나면
// AMEX/NYSE 종목의 미체결이 한 건도 안 잡혀 취소 안전망이 무용지물이 된다.
// 파이썬 원본은 brokers.py:110 에서 excd=cfg.excd 를 넘긴다.
describe("makeV4KisBroker.openOrders — 미체결 조회 거래소", () => {
  function spyClient() {
    const calls: string[] = [];
    return {
      calls,
      client: { usOpenOrders: async (excd = "NASD") => { calls.push(excd); return []; } },
    };
  }
  it("AMEX 상장(SOXL)은 AMEX 로 조회한다", async () => {
    const { calls, client } = spyClient();
    await makeV4KisBroker(client as never, "us").openOrders("SOXL");
    expect(calls).toEqual(["AMEX"]);
  });
  it("나스닥 상장(TQQQ)은 NASD — 종전과 같다", async () => {
    const { calls, client } = spyClient();
    await makeV4KisBroker(client as never, "us").openOrders("TQQQ");
    expect(calls).toEqual(["NASD"]);
  });
});

// #488 — 설정 검증용 run-now 는 실제 상태를 건드리면 안 된다.
describe("runInfiniteV4 — 일회성 실행은 상태를 남기지 않는다", () => {
  const CFG = { symbol: "TQQQ", principal: 10_000, splits: 20, starBase: 15, sellTarget: 15 };
  const b: V4Broker = {
    snapshot: async () => ({ holding: 32, avg: 100, price: 110, cash: 6_000 }),
    historyLong: async () => [], executions: async () => [], openOrders: async () => [],
    cancel: async () => {}, place: async () => "ORD1",
  };
  const state: V4State = {
    ...newV4State("TQQQ", 20, 10_000), t: 6.93, cycleCash: 6_000, lastRunDate: "20260921",
  };
  const call = (saveState?: unknown) => runInfiniteV4(
    { _id: "acc1", envKey: "paper-1", liveEnabled: false } as never,
    { _id: "pf1", market: "us", strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
    "run1" as never, b, "both", () => {}, saveState as never,
  );

  beforeEach(() => { persisted.length = 0; });

  it("기본(스케줄 사이클)은 종전대로 저장한다 — 모의 운용이 얼면 안 된다", async () => {
    await call();
    expect(persisted).toHaveLength(1);
  });
  it("discardState 를 주면 한 번도 저장하지 않는다", async () => {
    await call(discardState);
    expect(persisted).toHaveLength(0);
  });
});

// #491 — 오염된 입력은 조용히 넘기지 말고 실패시킨다. 그래야 #487 재시도가 걸리고
// 실패 메일이 나간다. 예전엔 price=0 이면 매도 0건으로 "done" 이 돼 결번이 안 보였다.
describe("runInfiniteV4 — 오염된 입력은 사이클을 실패시킨다", () => {
  const CFG = { symbol: "069500", principal: 10_000_000, splits: 20, starBase: 15, sellTarget: 10 };
  const state: V4State = {
    ...newV4State("069500", 20, 10_000_000), t: 6.93, cycleCash: 6_000_000, lastRunDate: "20260921",
  };
  const brokerOf = (o: { holding: number; avg: number; price: number }): V4Broker => ({
    snapshot: async () => ({ ...o, cash: 6_000_000 }),
    historyLong: async () => [], executions: async () => [], openOrders: async () => [],
    cancel: async () => {}, place: async () => "ORD1",
  });
  const call = (o: { holding: number; avg: number; price: number }) => runInfiniteV4(
    { _id: "acc1", envKey: "paper-1", liveEnabled: false } as never,
    { _id: "pf1", market: "kr", strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
    "run1" as never, brokerOf(o), "sell", () => {},
  );

  beforeEach(() => { persisted.length = 0; });

  it("현재가가 0 이면 던진다(장 마감·휴장 응답)", async () => {
    await expect(call({ holding: 32, avg: 100_000, price: 0 })).rejects.toThrow(/현재가/);
  });
  it("보유가 있는데 평단이 0 이면 던진다(빈 응답 파싱)", async () => {
    await expect(call({ holding: 32, avg: 0, price: 110_000 })).rejects.toThrow(/평단/);
  });
  it("실패한 사이클은 상태를 남기지 않는다", async () => {
    await call({ holding: 32, avg: 0, price: 110_000 }).catch(() => {});
    expect(persisted).toHaveLength(0);
  });
  it("보유 0 + 평단 0 은 정상이다(진입 전) — 던지지 않는다", async () => {
    await expect(call({ holding: 0, avg: 0, price: 110_000 })).resolves.toContain("V4");
  });
  it("정상 입력은 종전대로 돈다", async () => {
    await expect(call({ holding: 32, avg: 100_000, price: 110_000 })).resolves.toContain("V4");
  });
});

// #497 — 대사가 실패해도 창(lastRunDate)이 전진해 그날 체결이 영영 유실됐다.
// 2026-08-14 에 실제로 났다(OPSQ0003): 08-13 의 12주 매도가 T 에 반영되지 않았고
// 그 뒤로 장부가 어긋난 채 굳었다.
describe("runInfiniteV4 — 대사 실패는 창을 전진시키지 않는다", () => {
  const CFG = { symbol: "069500", principal: 10_000_000, splits: 20, starBase: 15, sellTarget: 10 };
  const state: V4State = {
    ...newV4State("069500", 20, 10_000_000), t: 9.18, cycleCash: 6_000_000, lastRunDate: "20260812",
  };
  const brokerOf = (failExecutions: boolean): V4Broker => ({
    snapshot: async () => ({ holding: 48, avg: 100_000, price: 110_000, cash: 6_000_000 }),
    historyLong: async () => [],
    executions: async () => {
      if (failExecutions) throw new Error("OPSQ0003: 서비스 라우팅 오류");
      return [];
    },
    openOrders: async () => [], cancel: async () => {}, place: async () => "ORD1",
  });
  const call = (fail: boolean, phase: "both" | "sell" | "buy" = "both") => runInfiniteV4(
    { _id: "acc1", envKey: "paper-1", liveEnabled: false } as never,
    { _id: "pf1", market: "kr", strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
    "run1" as never, brokerOf(fail), phase, () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("대사가 던지면 lastRunDate 를 그대로 둔다(다음 창이 놓친 날을 다시 읽는다)", async () => {
    await call(true);
    expect(persisted.at(-1)).toMatchObject({ lastRunDate: "20260812" });
  });

  it("대사가 성공하면 종전대로 '어제'로 전진한다", async () => {
    await call(false);
    expect(persisted.at(-1)).toMatchObject({ lastRunDate: prevMarketDay("20260922") });
  });

  it("대사 실패면 낡은 상태에 안 기대는 주문(¾ 익절)만 낸다", async () => {
    await call(true);
    expect(orderLogs).toHaveLength(1);
    expect(orderLogs[0]).toMatchObject({ side: "sell", qty: 36 }); // 48 − floor(48/4)
  });

  it("대사가 성공하면 매수 사다리·¼ 매도가 그대로 나간다", async () => {
    await call(false);
    expect(orderLogs.length).toBeGreaterThan(1);
    expect(orderLogs.some((o) => o.side === "buy")).toBe(true);
  });

  it("대사 실패 + 국장 매수 phase 는 주문이 없다(q75 는 sell phase 몫)", async () => {
    await call(true, "buy");
    expect(orderLogs).toHaveLength(0);
  });
});

// #497 후속 — 대사가 낡은 날엔 **장부를 건드리는 다른 경로도 막아야** 한다.
// absorbIdleCash 는 cycleCash 를 계좌현금으로 **덮어쓴다**. 그런데 못 읽은 체결의 대금은
// 이미 계좌현금에 들어 있으므로, 덮어쓴 뒤 내일 그 체결을 대사하면 같은 돈을 두 번 센다.
describe("runInfiniteV4 — 대사 실패일엔 유휴현금 흡수도 하지 않는다", () => {
  const CFG = { symbol: "069500", principal: 10_000_000, splits: 20, starBase: 15, sellTarget: 10 };
  const state: V4State = {
    ...newV4State("069500", 20, 10_000_000), t: 0, cycleCash: 3_000_000, lastRunDate: "20260812",
  };
  const brokerOf = (fail: boolean): V4Broker => ({
    // 플랫(전량 매도 직후) + 계좌엔 매도대금이 들어와 있다
    snapshot: async () => ({ holding: 0, avg: 0, price: 110_000, cash: 9_000_000 }),
    historyLong: async () => [],
    executions: async () => { if (fail) throw new Error("OPSQ0003"); return []; },
    openOrders: async () => [], cancel: async () => {}, place: async () => "ORD1",
  });
  const call = (fail: boolean) => runInfiniteV4(
    { _id: "acc1", envKey: "paper-1", liveEnabled: false } as never,
    { _id: "pf1", market: "kr", strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
    "run1" as never, brokerOf(fail), "both", () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("대사 실패면 cycleCash 를 그대로 둔다(이중계상 방지)", async () => {
    await call(true);
    expect(persisted.at(-1)).toMatchObject({ cycleCash: 3_000_000 });
  });
  it("대사 성공이면 종전대로 흡수한다(계좌현금 9M < 원금 10M → 9M 까지)", async () => {
    await call(false);
    expect(persisted.at(-1)).toMatchObject({ cycleCash: 9_000_000 });
  });
});
