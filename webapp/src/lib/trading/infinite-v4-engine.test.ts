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
// 킬스위치의 주문 직전 재확인은 DB 를 읽는다 — 단위 테스트에선 항상 live 로 둔다 (#509).
vi.mock("./killswitch", () => ({ isStillLive: async () => true }));

import { makeV4KisBroker, prevMarketDay, runInfiniteV4, type V4Broker } from "./infinite-v4-engine";
import { discardState } from "./state-saver";

/** 마지막으로 저장된 상태의 **오늘 발주 칸** (#523). 테스트 시계는 20260922 고정. */
const todayPend = (): V4Pending =>
  ((persisted.at(-1) as V4State).pendingByDate ?? {})["20260922"] ?? emptyPending();
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
  // 예약은 발주일 칸에 쌓인다 (#523). 테스트 시계(marketToday 목)는 20260922 고정.
  const TODAY = "20260922";
  const pendOf = (i: number) =>
    (persisted[i].pendingByDate as Record<string, V4Pending>)[TODAY] ?? emptyPending();

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

// #507 — 주문이 전량 거부돼도 "정상"으로 기록됐다. 실측으로 2026-09-25~09-30 6영업일간
// 접수 0건 / 실패 76건인데 전부 status=done, 요약은 "주문 17건"(계획 수), 메일 0통.
// 실전에선 증거금 부족·호가단위·휴장일 거부가 같은 방식으로 은폐된다.
describe("runInfiniteV4 — 주문 거부를 숨기지 않는다 (#507)", () => {
  const CFG = { symbol: "TQQQ", principal: 10_000, splits: 20, starBase: 15, sellTarget: 15 };
  const state: V4State = {
    ...newV4State("TQQQ", 20, 10_000), t: 6.0, cycleCash: 6_000, lastRunDate: "20260921",
  };
  const brokerOf = (place: () => Promise<string>): V4Broker => ({
    snapshot: async () => ({ holding: 32, avg: 100, price: 110, cash: 6_000 }),
    historyLong: async () => [], executions: async () => [], openOrders: async () => [],
    cancel: async () => {}, place,
  });
  const run = (place: () => Promise<string>, live = true) => runInfiniteV4(
    { _id: "acc1", envKey: "paper-1", liveEnabled: live } as never,
    { _id: "pf1", market: "us", strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
    "run1" as never, brokerOf(place), "both", () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; process.env.TRADING_LIVE_ALLOWED = "true"; });

  it("전량 거부되면 던진다 — 사이클이 done 으로 남으면 안 된다", async () => {
    await expect(run(async () => { throw new Error("40910000: 모의투자 주문이 불가한 계좌입니다."); }))
      .rejects.toThrow(/주문/);
  });

  it("거부도 원장에 남긴다 — 지금은 흔적이 0이라 무슨 일이 있었는지 모른다", async () => {
    await run(async () => { throw new Error("40910000"); }).catch(() => {});
    expect(orderLogs.length).toBeGreaterThan(0);
    expect(orderLogs.every((o) => o.orderNo === "")).toBe(true);
    expect(String(orderLogs[0].reason)).toContain("40910000");
  });

  it("일부라도 접수되면 던지지 않는다 — 주문 단위 격리는 유지", async () => {
    let n = 0;
    await expect(run(async () => {
      if (++n === 1) throw new Error("40030000: 호가단위 오류");
      return "ORD1";
    })).resolves.toContain("V4");
  });

  it("dry-run 은 접수가 0 이어도 던지지 않는다 — 안 그러면 모든 검증 실행이 실패로 찍힌다", async () => {
    await expect(run(async () => { throw new Error("안 불림"); }, false)).resolves.toContain("V4");
  });

  it("요약은 계획 수가 아니라 접수 수를 말한다", async () => {
    const line = await run(async () => "ORD1");
    expect(line).toMatch(/접수/);
  });
});

// #509 — 거부 사유에 따라 **할 일이 다르다**. 휴장일이면 사람이 할 게 없으므로 사이클을
// 실패로 만들지 않는다(공휴일마다 가짜 경보가 쌓이면 진짜 신호가 묻힌다). 계좌 문제면
// 사람이 증권사에서 고쳐야 반복이 멈추므로 실패로 올려 메일을 태운다.
describe("runInfiniteV4 — 거부 사유별로 다르게 다룬다 (#509)", () => {
  const CFG = { symbol: "TQQQ", principal: 10_000, splits: 20, starBase: 15, sellTarget: 15 };
  const state: V4State = {
    ...newV4State("TQQQ", 20, 10_000), t: 6.0, cycleCash: 6_000, lastRunDate: "20260921",
  };
  const runWith = (err: string) => runInfiniteV4(
    { _id: "acc1", envKey: "paper-1", liveEnabled: true } as never,
    { _id: "pf1", market: "us", strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
    "run1" as never,
    {
      snapshot: async () => ({ holding: 32, avg: 100, price: 110, cash: 6_000 }),
      historyLong: async () => [], executions: async () => [], openOrders: async () => [],
      cancel: async () => {}, place: async () => { throw new Error(err); },
    } as never,
    "both", () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; process.env.TRADING_LIVE_ALLOWED = "true"; });

  it("휴장일 거부는 던지지 않는다 — 조치할 게 없다", async () => {
    await expect(runWith("40910001: 장운영일이 아닙니다")).resolves.toContain("V4");
  });

  it("일시 오류도 던지지 않는다 — 다음 사이클에 풀린다", async () => {
    await expect(runWith("EGW00201: 초당 거래건수를 초과하였습니다.")).resolves.toContain("V4");
  });

  it("계좌 문제는 던진다 — 사람이 고쳐야 반복이 멈춘다", async () => {
    await expect(runWith("40910000: 모의투자 주문이 불가한 계좌입니다."))
      .rejects.toThrow(/증권사/);
  });

  it("자금 부족도 던진다", async () => {
    await expect(runWith("40250000: 주문가능금액이 부족합니다")).rejects.toThrow(/전부 거부/);
  });

  it("모르는 사유는 던진다 — 조용히 넘기는 쪽이 더 위험하다", async () => {
    await expect(runWith("99999999: 처음 보는 무엇")).rejects.toThrow(/전부 거부/);
  });

  it("안 던지는 경우에도 거부는 원장에 남는다 — 흔적 없이 넘어가지 않는다", async () => {
    await runWith("40910001: 장운영일이 아닙니다");
    expect(orderLogs.length).toBeGreaterThan(0);
    expect(String(orderLogs[0].reason)).toContain("40910001");
  });
});

// #515 — 계좌를 옮기면 state 가 초기화되고 lastRunDate 가 빈 문자열이 된다. 그러면
// `start = 오늘−14일` 이 되고 필터 `"" < f.date` 는 그 14일을 전부 통과시킨다.
// 새 계좌의 **우리와 무관한 체결**이 reconcileDay 에 들어가 cycleCash 만 깎는다
// (갓 만든 상태는 entryLimit=0·pending.one=0 이라 T 증가 분기가 전부 false).
//
// 새 상태에는 대사할 '우리 체결'이 없다. 조회 자체를 하지 않는 게 맞다.
describe("infinite-v4-engine — 새 상태(lastRunDate 없음)는 대사하지 않는다 (#515)", () => {
  const CFG = { symbol: "TQQQ", principal: 10_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-new", liveEnabled: false };

  const makeBroker = (execs: { date: string; side: "buy" | "sell"; qty: number; price: number }[],
                      seen: string[]): V4Broker => ({
    snapshot: async () => ({ holding: 0, avg: 0, price: 100, cash: 10_000 }),
    historyLong: async () => [],
    executions: async (_s, start) => { seen.push(start); return execs; },
    openOrders: async () => [],
    cancel: async () => {},
    place: async () => "ORD1",
  });

  const run = (state: V4State, b: V4Broker) =>
    runInfiniteV4(
      account as never,
      { _id: "pf1", market: "us", strategy: "infinite_v4", config: CFG, state: { v4: state } } as never,
      "run1" as never, b, "both", () => {},
    );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("체결 조회를 아예 하지 않는다 — 옮겨 온 계좌의 남의 체결을 긁지 않는다", async () => {
    const seen: string[] = [];
    await run(newV4State("TQQQ", 20, 10_000), makeBroker([], seen));
    expect(seen).toEqual([]);
  });

  it("새 계좌에 무관한 체결이 있어도 cycleCash 가 안 깎인다", async () => {
    const seen: string[] = [];
    const b = makeBroker([
      { date: "20260915", side: "buy", qty: 10, price: 50 },   // 사람이 손매매한 것
      { date: "20260916", side: "buy", qty: 10, price: 50 },
    ], seen);
    await run(newV4State("TQQQ", 20, 10_000), b);
    const saved = persisted.at(-1) as V4State | undefined;
    expect(saved?.cycleCash).toBe(10_000); // 1,000 안 깎임
    expect(saved?.t).toBe(0);
  });

  it("lastRunDate 가 있으면 종전대로 그 날짜부터 대사한다 — 회귀 방지", async () => {
    const seen: string[] = [];
    const state: V4State = { ...newV4State("TQQQ", 20, 10_000), lastRunDate: "20260920" };
    await run(state, makeBroker([], seen));
    expect(seen).toEqual(["20260920"]);
  });
});

// #519 ① — 예약현금(reservedCash)이 v4 주문 크기에 상한으로 작동하지 않았다.
// 사이징은 state.cycleCash 만 쓰고, 브로커 cash 는 absorbIdleCash 한 곳에만 들어가는데
// 그 함수는 `next > cycleCash` 일 때만 반영이라 **캡이 구조적으로 못 내려간다**.
// 실측: kr 예약 678만 vs principal 1,091만(61% 초과), TQQQ 52,000 vs 93,300(79% 초과).
//
// cycleCash 를 런타임에 깎으면 복리 장부(#485)와 사이클 중 분할 스케줄이 깨진다.
// 그래서 **주문 전 현금 게이트**로 막는다(파이썬 engine.run_once 의 "현금 부족 — 매수 보류").
describe("infinite-v4-engine — 매수는 가용현금 안에서만 나간다 (#519)", () => {
  const CFG = { symbol: "TQQQ", principal: 100_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-1", liveEnabled: false };

  // dry-run 이라 broker.place 는 안 불린다 — 주문은 원장(TradingOrderLog)에 남는다.
  // #521 로 보류된 주문도 원장에 남는다 — '나간 주문'만 센다.
  const buys = () => orderLogs.filter((o) => o.side === "buy"
    && !String(o.reason).includes("현금 부족 보류"));
  const sells = () => orderLogs.filter((o) => o.side === "sell");
  const buyCost = () => buys().reduce((a, o) => a + Number(o.qty) * Number(o.price), 0);

  const brokerWith = (cash: number, holding = 0, avg = 0): V4Broker => ({
    snapshot: async () => ({ holding, avg, price: 100, cash }),
    historyLong: async () => [],
    executions: async () => [],
    openOrders: async () => [],
    cancel: async () => {},
    place: async () => "ORD",
  });

  const run = (b: V4Broker) => runInfiniteV4(
    account as never,
    { _id: "pf1", market: "us", strategy: "infinite_v4", config: CFG,
      state: { v4: { ...newV4State("TQQQ", 20, 100_000), lastRunDate: "20260921" } } } as never,
    "run1" as never, b, "both", () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("가용현금이 장부보다 작으면 그 안에서만 산다", async () => {
    await run(brokerWith(5_000));
    expect(buys().length).toBeGreaterThan(0);
    expect(buyCost()).toBeLessThanOrEqual(5_000);
  });

  it("현금이 충분하면 더 많이 산다 — 게이트가 정상 매수를 깎으면 안 된다", async () => {
    await run(brokerWith(5_000));
    const small = buyCost();
    orderLogs.length = 0; persisted.length = 0;
    await run(brokerWith(1_000_000));
    expect(buyCost()).toBeGreaterThan(small);
  });

  it("현금이 0 이면 매수는 한 건도 안 나간다", async () => {
    await run(brokerWith(0));
    expect(buys()).toHaveLength(0);
  });

  it("현금이 없어도 매도(익절)는 막지 않는다 — 보호 주문이다", async () => {
    await run(brokerWith(0, 100, 50)); // 평단 50 · 현재가 100 → 익절 대상
    expect(sells().length).toBeGreaterThan(0);
  });
});

// #519 ② — 대사 실패(degraded)·크래시 때 mergePending·saveState 가 무조건 실행돼
// **전일 예약이 당일 계산값으로 덮였다**. lastRunDate 만 가드돼 있었다.
// T 는 하루 매수액·별지점·reverse 전환을 직접 정한다. 2026-08-14 kr OPSQ0003 실사례 있음.
describe("infinite-v4-engine — degraded 면 예약(pending)을 덮지 않는다 (#519)", () => {
  const CFG = { symbol: "069500", principal: 10_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-1", liveEnabled: false };
  const PEND = { one: 493_886, q25: 7, q75: 18, reverseSell: 0, reverseFirst: false };

  const broker = (fail: boolean): V4Broker => ({
    snapshot: async () => ({ holding: 32, avg: 100, price: 110, cash: 6_000 }),
    historyLong: async () => [],
    executions: async () => { if (fail) throw new Error("OPSQ0003: 서비스 라우팅 오류"); return []; },
    openOrders: async () => [],
    cancel: async () => {},
    place: async () => "ORD",
  });

  const run = (fail: boolean) => runInfiniteV4(
    account as never,
    { _id: "pf1", market: "kr", strategy: "infinite_v4", config: CFG,
      state: { v4: { ...newV4State("069500", 20, 10_000), t: 6.93, cycleCash: 6_000,
                     lastRunDate: "20260921", pending: PEND } } } as never,
    "run1" as never, broker(fail), "both", () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("대사가 실패하면 그 날 one 을 안 적는다 — 매수를 안 냈으니 분모가 없다 (#523)", async () => {
    // #523 부터 예약은 **발주일 칸**에 쌓인다. 전일 값은 전일 칸에 그대로 있으므로
    // 따로 보존할 필요가 없다 — 여기서 볼 것은 "오늘 칸에 거짓 분모를 안 남기는가" 다.
    await run(true);
    expect(todayPend().one).toBe(0);
  });

  it("대사가 성공하면 종전대로 새 예약으로 갱신된다 — 회귀 방지", async () => {
    await run(false);
    expect(todayPend()).not.toEqual(PEND);
  });
});

// #521 — degraded 사이클이 실제로 내보낸 q75 가 예약에 남아야 한다(#519 가 통째로 막았다).
describe("infinite-v4-engine — degraded 여도 내보낸 q75 는 예약에 남는다 (#521)", () => {
  const CFG = { symbol: "069500", principal: 10_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-1", liveEnabled: false };
  const PREV = { one: 493_886, q25: 7, q75: 18, reverseSell: 3, reverseFirst: false };

  const broker: V4Broker = {
    snapshot: async () => ({ holding: 32, avg: 100, price: 130, cash: 6_000 }), // 평단+30% → 익절
    historyLong: async () => [],
    executions: async () => { throw new Error("OPSQ0003: 서비스 라우팅 오류"); },
    openOrders: async () => [],
    cancel: async () => {},
    place: async () => "ORD",
  };

  const run = (phase: "both" | "sell" | "buy") => runInfiniteV4(
    account as never,
    { _id: "pf1", market: "kr", strategy: "infinite_v4", config: CFG,
      state: { v4: { ...newV4State("069500", 20, 10_000), t: 6.93, cycleCash: 6_000,
                     lastRunDate: "20260921", pending: PREV } } } as never,
    "run1" as never, broker, phase, () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("sell phase: 오늘 낸 q75 수량이 예약에 기록된다", async () => {
    await run("sell");
    const q75Sent = orderLogs.find((o) => String(o.reason).includes("75% 익절"));
    expect(q75Sent).toBeDefined();
    expect(todayPend().q75).toBe(Number(q75Sent!.qty));
  });

  it("전일 one 은 그대로 — 낡은 장부로 다시 계산하면 T 증분이 틀린다", async () => {
    await run("sell");
    // one 은 그 날 낸 사다리 기준이다 — degraded 면 매수를 안 내므로 0 이다(#523).
    expect(todayPend().q25).toBe(0);
  });

  it("오늘 안 낸 칸은 비운다", async () => {
    await run("sell");
    const p = todayPend();
    expect(p.q25).toBe(0);
    expect(p.reverseSell).toBe(0);
  });

  it("buy phase 는 앞 phase 의 q75 를 이어받는다 — #483 과 같은 이유", async () => {
    await run("buy");
    // buy phase 는 같은 날 칸에 쌓이므로 sell 이 적은 q75 가 그대로 있다(#523).
    expect(todayPend().q75).toBe(0); // 이 테스트는 buy 단독 실행이라 sell 기록이 없다
  });
});

// #521 ② — 현금 게이트가 떨어낸 매수가 원장에 0줄이고, 전량 skip 이면 실패 게이트도 안 걸린다.
describe("infinite-v4-engine — 현금으로 떨어낸 주문은 흔적을 남긴다 (#521)", () => {
  const CFG = { symbol: "TQQQ", principal: 100_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-1", liveEnabled: false };

  const broker = (cash: number, holding = 0, avg = 0): V4Broker => ({
    snapshot: async () => ({ holding, avg, price: 100, cash }),
    historyLong: async () => [], executions: async () => [], openOrders: async () => [],
    cancel: async () => {}, place: async () => "ORD",
  });

  const run = (b: V4Broker) => runInfiniteV4(
    account as never,
    { _id: "pf1", market: "us", strategy: "infinite_v4", config: CFG,
      state: { v4: { ...newV4State("TQQQ", 20, 100_000), lastRunDate: "20260921" } } } as never,
    "run1" as never, b, "both", () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("현금으로 떨어낸 매수가 원장에 남는다 — 안 남으면 왜 안 샀는지 못 본다", async () => {
    await run(broker(1_000)); // 계획보다 훨씬 적은 현금
    const held = orderLogs.filter((o) => String(o.reason).includes("현금 부족"));
    expect(held.length).toBeGreaterThan(0);
    expect(held[0].orderNo).toBe("");
  });

  it("떨어낸 주문은 전송되지 않는다", async () => {
    const placed: unknown[] = [];
    const b = { ...broker(1_000), place: async () => { placed.push(1); return "ORD"; } };
    await run(b as V4Broker);
    expect(placed).toHaveLength(0); // dry-run 이라 어차피 0 — 회귀 가드
  });

  it("매도는 떨어내지 않는다", async () => {
    await run(broker(0, 100, 50));
    expect(orderLogs.filter((o) => o.side === "sell").length).toBeGreaterThan(0);
    expect(orderLogs.filter((o) => o.side === "sell" && String(o.reason).includes("현금 부족")))
      .toHaveLength(0);
  });
});

// #521 ③ — degraded 사이클이 status=done·요약 표기 없이 끝났다. real 에서 executions TR 이
// 지속 실패하면 v4 매수·VR 전량이 영구 정지하는데 대시보드는 매일 done 이다.
describe("infinite-v4-engine — degraded 는 요약에 드러난다 (#521)", () => {
  const CFG = { symbol: "069500", principal: 10_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-1", liveEnabled: false };
  const broker = (fail: boolean): V4Broker => ({
    snapshot: async () => ({ holding: 32, avg: 100, price: 130, cash: 6_000 }),
    historyLong: async () => [],
    executions: async () => { if (fail) throw new Error("OPSQ0003"); return []; },
    openOrders: async () => [], cancel: async () => {}, place: async () => "ORD",
  });
  const run = (fail: boolean) => runInfiniteV4(
    account as never,
    { _id: "pf1", market: "kr", strategy: "infinite_v4", config: CFG,
      state: { v4: { ...newV4State("069500", 20, 10_000), t: 6.93, cycleCash: 6_000,
                     lastRunDate: "20260921" } } } as never,
    "run1" as never, broker(fail), "both", () => {},
  );

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("요약에 '대사실패' 가 들어간다 — 요약은 모니터링·메일에 그대로 실린다", async () => {
    expect(await run(true)).toMatch(/대사실패/);
  });

  it("정상이면 안 붙는다", async () => {
    expect(await run(false)).not.toMatch(/대사실패/);
  });
});

// #525 — 타임아웃·네트워크로 끊긴 주문은 **접수 여부를 모른다**. 거부와 같은 orderNo:"" 로
// 적으면 재시도 가드가 "안 나갔다" 로 읽고 같은 수량을 다시 낸다.
describe("infinite-v4-engine — 접수 불명은 거부와 다르게 적는다 (#525)", () => {
  const CFG = { symbol: "TQQQ", principal: 100_000, splits: 20, starBase: 15, sellTarget: 10 };
  const account = { _id: "acc1", envKey: "paper-1", liveEnabled: true };

  const mk = (err: string): V4Broker => ({
    snapshot: async () => ({ holding: 0, avg: 0, price: 100, cash: 1_000_000 }),
    historyLong: async () => [], executions: async () => [], openOrders: async () => [],
    cancel: async () => {},
    place: async () => { throw new Error(err); },
  });

  const run = (err: string) => runInfiniteV4(
    account as never,
    { _id: "pf1", market: "us", strategy: "infinite_v4", config: CFG,
      state: { v4: { ...newV4State("TQQQ", 20, 100_000), lastRunDate: "20260921" } } } as never,
    "run1" as never, mk(err), "both", () => {},
  ).catch((e) => String(e));

  beforeEach(() => { persisted.length = 0; orderLogs.length = 0; });

  it("타임아웃이면 orderNo 가 '?' 다", async () => {
    await run("The operation was aborted due to timeout");
    expect(orderLogs.length).toBeGreaterThan(0);
    expect(orderLogs[0].orderNo).toBe("?");
  });

  it("증권사 거부는 종전대로 빈 문자열이다 — 안 나간 게 분명하다", async () => {
    await run("40250000: 주문가능금액이 부족합니다");
    expect(orderLogs[0].orderNo).toBe("");
  });

  it("접수 불명 사유가 원장에 남는다 — 사후에 증권사와 대조해야 한다", async () => {
    await run("fetch failed");
    expect(String(orderLogs[0].reason)).toMatch(/접수 불명/);
  });
});
