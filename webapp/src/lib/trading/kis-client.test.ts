import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #484 — 주문(POST)이 유량제한(EGW00201)에 재시도 없이 버려지던 회귀 방지.
// DB·유량제한은 목킹하고 fetch 만 갈아 끼워 재시도 규칙 자체를 본다.

vi.mock("@/lib/db", () => ({ connectToDB: async () => {} }));
// 토큰 캐시를 들고 있는 가짜 컬렉션 — 무엇이 저장됐는지 봐야 #492 를 검증할 수 있다.
const store = vi.hoisted(() => ({
  doc: null as null | { token: string; expiresAt: number },
  writes: [] as string[],
}));
vi.mock("@/models/trading-token", () => ({
  default: {
    findOne: () => ({ lean: async () => store.doc }),
    updateOne: async (_q: unknown, u: { $set: { token: string; expiresAt: number } }) => {
      store.writes.push(u.$set.token);
      store.doc = { token: u.$set.token, expiresAt: u.$set.expiresAt };
    },
  },
}));
vi.mock("./rate-limit", () => ({ throttle: async () => {} }));

process.env.TRADING_SECRET_KEY = "a".repeat(64);

import { KisClient } from "./kis-client";
import { decryptSecret, encryptSecret } from "./crypto";

const OK = { rt_cd: "0", output: { ODNO: "0001234" } };
const RATE_LIMITED = { rt_cd: "1", msg_cd: "EGW00201", msg1: "초당 거래건수를 초과하였습니다." };
const NO_CASH = { rt_cd: "1", msg_cd: "40250000", msg1: "주문가능금액이 부족합니다" };
const TOKEN_EXPIRED = { msg_cd: "EGW00123", msg1: "token expired" };
const MCI_ERROR = { msg_cd: "OPSQ0008", msg1: "호출 후처리(MCI전송) 오류 입니다." };

function res(body: unknown, status = 200): Response {
  return {
    ok: status < 400, status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: { get: () => "" },
  } as unknown as Response;
}

const client = () => new KisClient({
  env: "real", appKey: "APPKEY12", appSecret: "SECRET", accountNo: "12345678-01",
});
const order = () => client().krOrder("069500", 1, "buy", { market: true });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  // 캐시에는 **암호화된** 토큰이 들어 있다(#492) — 그래야 재발급 없이 바로 쓴다.
  store.doc = { token: encryptSecret("TOKEN"), expiresAt: Date.now() + 86_400_000 };
  store.writes.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 재시도 백오프(sleep)를 통과시키며 결과를 받는다. */
async function settle<T>(p: Promise<T>): Promise<T | Error> {
  const wrapped = p.catch((e: Error) => e);
  await vi.advanceTimersByTimeAsync(60_000);
  return wrapped;
}

describe("KisClient.post — 유량제한 재시도(접수 전 거부에 한해서만)", () => {
  it("EGW00201 한 번 뒤 성공하면 주문번호를 돌려준다(주문을 버리지 않는다)", async () => {
    fetchMock.mockResolvedValueOnce(res(RATE_LIMITED)).mockResolvedValueOnce(res(OK));
    expect(await settle(order())).toBe("0001234");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("유량제한이 계속되면 무한재시도 없이 실패한다", async () => {
    fetchMock.mockResolvedValue(res(RATE_LIMITED));
    expect(await settle(order())).toBeInstanceOf(Error);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("잔고부족 같은 다른 거부는 재시도하지 않는다(중복 주문 방지)", async () => {
    fetchMock.mockResolvedValue(res(NO_CASH));
    expect(String(await settle(order()))).toContain("40250000");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("접수 여부를 알 수 없는 5xx 는 재시도하지 않는다(비멱등 원칙 유지)", async () => {
    fetchMock.mockResolvedValue(res(MCI_ERROR, 500));
    expect(String(await settle(order()))).toContain("OPSQ0008");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("토큰만료(5xx+EGW00123)는 재발급 후 1회만 재전송한다", async () => {
    fetchMock
      .mockResolvedValueOnce(res(TOKEN_EXPIRED, 500))      // 주문 — 토큰 만료
      .mockResolvedValueOnce(res({ access_token: "NEW" })) // 토큰 재발급
      .mockResolvedValueOnce(res(OK));                     // 주문 재전송
    expect(await settle(order())).toBe("0001234");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("토큰만료가 반복돼도 재발급은 한 번뿐이다(발급 1분 1회 제한)", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("tokenP") ? res({ access_token: "NEW" }) : res(TOKEN_EXPIRED, 500));
    expect(await settle(order())).toBeInstanceOf(Error);
    const tokenCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("tokenP"));
    expect(tokenCalls).toHaveLength(1);
  });
});

// #492 — 자격증명은 암호화하면서 그걸로 받은 토큰은 평문으로 DB 에 뒀다.
// 암호화의 위협 모델(DB 만 털린 경우)이 최대 23시간 무력해진다.
describe("KisClient 토큰 캐시 — 저장은 암호화", () => {
  it("발급받은 토큰을 평문으로 저장하지 않는다", async () => {
    store.doc = null; // 캐시 비움 → 발급 경로
    fetchMock
      .mockResolvedValueOnce(res({ access_token: "SECRET-TOKEN" }))
      .mockResolvedValueOnce(res(OK));
    await settle(order());
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]).not.toContain("SECRET-TOKEN");
    expect(decryptSecret(store.writes[0])).toBe("SECRET-TOKEN");
  });

  it("암호화된 캐시는 재발급 없이 그대로 쓴다", async () => {
    fetchMock.mockResolvedValueOnce(res(OK));
    await settle(order());
    expect(fetchMock).toHaveBeenCalledTimes(1); // 토큰 발급 호출 없음
    expect(store.writes).toHaveLength(0);
  });

  it("예전에 저장된 평문 캐시는 캐시 미스로 떨어져 재발급된다(자가치유)", async () => {
    store.doc = { token: "LEGACY-PLAINTEXT", expiresAt: Date.now() + 86_400_000 };
    fetchMock
      .mockResolvedValueOnce(res({ access_token: "NEW-TOKEN" }))
      .mockResolvedValueOnce(res(OK));
    expect(await settle(order())).toBe("0001234");
    expect(decryptSecret(store.writes[0])).toBe("NEW-TOKEN");
  });
});

// #511 — #507 이 잔고를 거래소 순회로 바꾸면서 평가금액을 **중복합산**했다.
// KIS 모의 해외잔고는 OVRS_EXCG_CD 와 무관하게 보유를 다 돌려준다:
//   NASD → SOXL 51 + TQQQ 204 · AMEX → SOXL 51 (같은 것)
// pos 는 `!pos[sym]` 로 막았는데 hvBroker 는 `+=` 만 해서 SOXL 이 두 번 더해졌다.
// totalValue 로 portfoliohistories 에 박히므로 총자산이 영구히 부푼다(#500·#501 과 같은 계열).
describe("usAccount — 거래소 순회가 같은 보유를 두 번 세지 않는다 (#511)", () => {
  const holding = (sym: string, qty: number, avg: number, evlu: number) => ({
    ovrs_pdno: sym, ovrs_cblc_qty: String(qty),
    pchs_avg_pric: String(avg), ovrs_stck_evlu_amt: String(evlu),
  });
  /** 거래소별 응답을 순서대로 돌려준다. psamount(현금)는 마지막에 한 번. */
  const balances = (byExcd: Record<string, unknown[]>) => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("inquire-psamount")) {
        return res({ rt_cd: "0", output: { ord_psbl_frcr_amt: "1000" } });
      }
      const excd = /OVRS_EXCG_CD=([A-Z]+)/.exec(u)?.[1] ?? "";
      return res({ rt_cd: "0", output1: byExcd[excd] ?? [] });
    });
  };

  it("같은 종목이 두 거래소에 나와도 평가금액을 한 번만 더한다", async () => {
    balances({
      NASD: [holding("SOXL", 51, 120, 7371.54), holding("TQQQ", 204, 70, 15761.35)],
      NYSE: [],
      AMEX: [holding("SOXL", 51, 120, 7371.54)], // 같은 보유가 또 온다
    });
    const [pos, , hv] = await settle(client().usAccount()) as [Record<string, [number, number]>, number, number];
    expect(pos).toEqual({ SOXL: [51, 120], TQQQ: [204, 70] });
    expect(hv).toBeCloseTo(7371.54 + 15761.35, 2); // 23,132.89 — 30,504 가 아니다
  });

  it("거래소마다 다른 종목이면 전부 더한다", async () => {
    balances({
      NASD: [holding("TQQQ", 10, 70, 700)],
      NYSE: [holding("XOM", 5, 100, 500)],
      AMEX: [holding("SOXL", 2, 120, 240)],
    });
    const [pos, , hv] = await settle(client().usAccount()) as [Record<string, [number, number]>, number, number];
    expect(Object.keys(pos).sort()).toEqual(["SOXL", "TQQQ", "XOM"]);
    expect(hv).toBeCloseTo(1440, 2);
  });

  it("수량 0 인 행은 보유도 평가금액도 안 센다", async () => {
    balances({ NASD: [holding("TQQQ", 0, 70, 0), holding("SOXL", 3, 120, 360)], NYSE: [], AMEX: [] });
    const [pos, , hv] = await settle(client().usAccount()) as [Record<string, [number, number]>, number, number];
    expect(pos).toEqual({ SOXL: [3, 120] });
    expect(hv).toBeCloseTo(360, 2);
  });

  it("전 거래소가 실패하면 던진다 — 빈 보유를 '보유 없음' 으로 돌려주면 안 된다", async () => {
    fetchMock.mockImplementation(async () => res({ rt_cd: "1", msg_cd: "MCA00000", msg1: "서비스 없음" }));
    expect(await settle(client().usAccount())).toBeInstanceOf(Error);
  });
});

// #519 ③ — psamount(매수가능금액) 조회 실패를 `cash = 0` 으로 삼켰다.
// 바로 위 `if (!balOk) throw`(「조회 실패와 실제 0 을 구분해야 한다」)와 모순이고,
// 주석의 "파이썬과 동일" 이 사실이 아니다 — 파이썬은 WARNING + 예수금 폴백이다.
// 실측: 미장 잔고 응답 output2 에 **예수금 필드가 없다**(매입금액·손익만) → 폴백할 값이
// 없으므로 바로 위와 같은 정책(던지기)으로 맞춘다.
//
// 삼키면 VR 은 **매수만 전멸하고 매도는 정상 접수**돼 accepted===0 가드에도 안 걸린다 —
// 포지션이 조용히 단조 감소한다.
describe("usAccount — 매수가능금액 조회 실패를 삼키지 않는다 (#519)", () => {
  const H = [{ ovrs_pdno: "TQQQ", ovrs_cblc_qty: "10", pchs_avg_pric: "80",
               ovrs_stck_evlu_amt: "900" }];

  it("psamount 가 실패하면 던진다 — 현금 0 으로 계속 가면 매수만 조용히 사라진다", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("inquire-psamount")
        ? res({ rt_cd: "1", msg_cd: "OPSQ0003", msg1: "서비스 라우팅 오류" })
        : res({ rt_cd: "0", output1: H }));
    const e = await settle(client().usAccount());
    expect(e).toBeInstanceOf(Error);
    expect(String((e as Error).message)).toMatch(/매수가능금액/);
  });

  it("psamount 가 성공하면 그 값을 쓴다 — 회귀 방지", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("inquire-psamount")
        ? res({ rt_cd: "0", output: { ord_psbl_frcr_amt: "1234.5" } })
        : res({ rt_cd: "0", output1: H }));
    const [, cash] = await settle(client().usAccount()) as [unknown, number, number];
    expect(cash).toBeGreaterThan(0);
  });
});
