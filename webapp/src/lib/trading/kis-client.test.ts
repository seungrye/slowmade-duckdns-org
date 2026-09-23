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
