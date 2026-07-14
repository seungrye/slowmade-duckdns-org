// 토스증권 Open API 클라이언트 — 파이썬 stock-automator-v2 toss/{auth,client,invest}.py
// 포팅. 국내·미국 단일 API(심볼로 구분: 6자리 숫자=KR, 티커=US). 실계좌 전용.
// 스펙 요약: stock-automator-v2 docs/toss-api.md

import { connectToDB } from "@/lib/db";
import TradingToken from "@/models/trading-token";
import { krTickRound } from "./kr-tick";
import { throttle } from "./rate-limit";

export type TossCreds = {
  clientId: string;
  clientSecret: string;
  accountSeq?: number | null; // 생략 → 첫 BROKERAGE 계좌 자동
};

const BASE = "https://openapi.tossinvest.com";
const TOKEN_ERROR_CODES = new Set(["expired-token", "invalid-token", "login-user-not-found"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TossError extends Error {
  constructor(public code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

type Json = Record<string, unknown>;

export class TossClient {
  private token: string | null = null;
  private accountSeq: number | null;

  constructor(private creds: TossCreds) {
    this.accountSeq = creds.accountSeq ?? null;
  }

  private get cacheKey(): string {
    return `toss:${this.creds.clientId.slice(0, 8)}`;
  }

  private async getToken(force = false): Promise<string> {
    if (this.token && !force) return this.token;
    await connectToDB();
    if (!force) {
      const cached = await TradingToken.findOne({ cacheKey: this.cacheKey }).lean();
      if (cached && cached.expiresAt - 60_000 > Date.now()) {
        this.token = cached.token;
        return this.token;
      }
    }
    await throttle();
    const resp = await fetch(`${BASE}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
      }),
    });
    if (!resp.ok) throw new TossError(`http-${resp.status}`, "토큰 발급 실패");
    const body = (await resp.json()) as Json;
    this.token = String(body.access_token);
    const expiresIn = Number(body.expires_in ?? 3600) * 1000;
    await TradingToken.updateOne(
      { cacheKey: this.cacheKey },
      { $set: { token: this.token, expiresAt: Date.now() + expiresIn } },
      { upsert: true },
    );
    return this.token;
  }

  async forceRefresh(): Promise<void> {
    await this.getToken(true);
  }

  private async resolveAccountSeq(): Promise<number> {
    if (this.accountSeq !== null) return this.accountSeq;
    const accounts = ((await this.get("/api/v1/accounts")) as Json[]) ?? [];
    const brokerage = accounts.find((a) => a.accountType === "BROKERAGE");
    if (!brokerage) throw new TossError("account-not-found", "BROKERAGE 계좌 없음");
    this.accountSeq = Number(brokerage.accountSeq);
    return this.accountSeq;
  }

  private async headers(account: boolean): Promise<Record<string, string>> {
    const h: Record<string, string> = { Authorization: `Bearer ${await this.getToken()}` };
    if (account) h["X-Tossinvest-Account"] = String(await this.resolveAccountSeq());
    return h;
  }

  private static errorCode(text: string): string {
    try {
      return String(((JSON.parse(text) as Json).error as Json | undefined)?.code ?? "");
    } catch {
      return "";
    }
  }

  async get(path: string, params?: Record<string, string>, account = false): Promise<unknown> {
    const url = `${BASE}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
    let tokenRefreshed = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await throttle();
      let resp: Response;
      try {
        resp = await fetch(url, { headers: await this.headers(account) });
      } catch (e) {
        if (attempt === 3) throw e;
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      const text = await resp.text();
      if (resp.status === 401 && !tokenRefreshed && TOKEN_ERROR_CODES.has(TossClient.errorCode(text))) {
        tokenRefreshed = true;
        await this.getToken(true);
        continue;
      }
      if ((resp.status === 429 || resp.status >= 500) && attempt < 3) {
        const retryAfter = Number(resp.headers.get("Retry-After") ?? 0);
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
        continue;
      }
      return TossClient.handle(resp.status, text);
    }
    throw new TossError("retry-exhausted", `GET ${path}`);
  }

  async post(path: string, body: Json, account = true): Promise<unknown> {
    const doPost = async () =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { ...(await this.headers(account)), "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    await throttle();
    let resp = await doPost();
    let text = await resp.text();
    // 401(미접수)·429(접수 전 차단)만 1회 재시도 — 그 외 비멱등 재시도 금지.
    if (resp.status === 401 && TOKEN_ERROR_CODES.has(TossClient.errorCode(text))) {
      await this.getToken(true);
      await throttle();
      resp = await doPost();
      text = await resp.text();
    } else if (resp.status === 429) {
      await sleep(Number(resp.headers.get("Retry-After") ?? 1) * 1000);
      await throttle();
      resp = await doPost();
      text = await resp.text();
    }
    return TossClient.handle(resp.status, text);
  }

  private static handle(status: number, text: string): unknown {
    let data: Json;
    try {
      data = JSON.parse(text) as Json;
    } catch {
      throw new TossError(`http-${status}`, text.slice(0, 120));
    }
    if (status >= 400) {
      const err = (data.error ?? {}) as Json;
      throw new TossError(String(err.code ?? `http-${status}`), String(err.message ?? ""));
    }
    return data.result ?? data;
  }

  // ── 도메인(파이썬 toss/invest.py 대응) ───────────────────────

  async price(symbol: string): Promise<number> {
    const rows = ((await this.get("/api/v1/prices", { symbols: symbol })) as Json[]) ?? [];
    if (!rows.length) throw new TossError("stock-not-found", symbol);
    return Number(rows[0].lastPrice ?? 0);
  }

  /** (YYYYMMDD, 종가) 최신순 — nextBefore 페이지네이션 병합. */
  async historyLong(symbol: string, need = 210): Promise<[string, number][]> {
    const out: [string, number][] = [];
    let before: string | null = null;
    for (let i = 0; i < 10; i++) {
      const params: Record<string, string> = {
        symbol, interval: "1d", count: "200", adjusted: "true",
      };
      if (before) params.before = before;
      const result = ((await this.get("/api/v1/candles", params)) ?? {}) as Json;
      const candles = (result.candles as Json[]) ?? [];
      for (const c of candles) {
        out.push([String(c.timestamp ?? "").slice(0, 10).replace(/-/g, ""), Number(c.closePrice ?? 0)]);
      }
      before = (result.nextBefore as string | null) ?? null;
      if (out.length >= need || !before || !candles.length) break;
    }
    out.sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return out;
  }

  /** 거래대금(종가×거래량) 시계열 과거→최신 — rotation 자동선발용. */
  async valueSeries(symbol: string): Promise<number[]> {
    const result = ((await this.get("/api/v1/candles", {
      symbol, interval: "1d", count: "40", adjusted: "true",
    })) ?? {}) as Json;
    const rows = ((result.candles as Json[]) ?? [])
      .map((c) => [String(c.timestamp ?? "").slice(0, 10),
                   Number(c.closePrice ?? 0) * Number(c.volume ?? 0)] as const);
    rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return rows.map(([, v]) => v);
  }

  /** 보유맵(시장 필터) + 현금(매수가능, KRW|USD). */
  async account(market: "kr" | "us"): Promise<[Record<string, [number, number]>, number, number]> {
    const data = ((await this.get("/api/v1/holdings", undefined, true)) ?? {}) as Json;
    const country = market === "kr" ? "KR" : "US";
    const pos: Record<string, [number, number]> = {};
    let hvBroker = 0; // 토스 평가금액(필드 있으면 사용, 없으면 0 → close-sync 폴백)
    for (const it of (data.items as Json[]) ?? []) {
      if (it.marketCountry !== country) continue;
      const q = Math.trunc(Number(it.quantity ?? 0));
      if (q > 0) pos[String(it.symbol)] = [q, Number(it.averagePurchasePrice ?? 0)];
      hvBroker += Number(it.evaluationAmount ?? it.evalAmount ?? 0);
    }
    const bp = ((await this.get(
      "/api/v1/buying-power",
      { currency: market === "kr" ? "KRW" : "USD" },
      true,
    )) ?? {}) as Json;
    return [pos, Number(bp.cashBuyingPower ?? 0), hvBroker];
  }

  /** 시장가 주문 → orderId. clientOrderId 는 멱등키(10분). */
  async orderMarket(symbol: string, qty: number, side: "buy" | "sell",
                    clientOrderId?: string): Promise<string> {
    const body: Json = {
      symbol,
      side: side.toUpperCase(),
      orderType: "MARKET",
      quantity: String(Math.trunc(qty)),
    };
    if (clientOrderId) body.clientOrderId = clientOrderId.slice(0, 36);
    const result = ((await this.post("/api/v1/orders", body)) ?? {}) as Json;
    return String(result.orderId ?? "");
  }

  /** 지정가 주문 — cls=true 면 LOC(LIMIT+timeInForce=CLS, 미국 전용). 가격 포맷:
   *  KR 정수 원 / US $1↑ 소수2자리·$1↓ 4자리(파이썬 toss/invest._format_price 동일). */
  async orderLimit(symbol: string, qty: number, side: "buy" | "sell", price: number,
                   opts: { cls?: boolean; clientOrderId?: string } = {}): Promise<string> {
    const priceStr = /^\d+$/.test(symbol)
      ? String(krTickRound(price, side)) // KR: 호가단위(ETF 5원) — 매도 올림·매수 내림
      : price < 1 ? price.toFixed(4) : price.toFixed(2);
    const body: Json = {
      symbol,
      side: side.toUpperCase(),
      orderType: "LIMIT",
      quantity: String(Math.trunc(qty)),
      price: priceStr,
    };
    if (opts.cls) body.timeInForce = "CLS";
    if (opts.clientOrderId) body.clientOrderId = opts.clientOrderId.slice(0, 36);
    const result = ((await this.post("/api/v1/orders", body)) ?? {}) as Json;
    return String(result.orderId ?? "");
  }

  /** 대기중(OPEN) 주문 — 취소 안전망용. status=CLOSED 는 토스가 아직 미지원(400). */
  async openOrders(symbol?: string): Promise<Json[]> {
    const params: Record<string, string> = { status: "OPEN" };
    if (symbol) params.symbol = symbol;
    const result = ((await this.get("/api/v1/orders", params, true)) ?? {}) as Json;
    return (result.orders as Json[]) ?? [];
  }

  async cancelOrder(orderId: string): Promise<string> {
    const result = ((await this.post(`/api/v1/orders/${orderId}/cancel`, {})) ?? {}) as Json;
    return String(result.orderId ?? "");
  }

  /** 주문 상세(모든 상태) — 체결 대사용(execution.filledQuantity 등). */
  async orderDetail(orderId: string): Promise<Json> {
    return ((await this.get(`/api/v1/orders/${orderId}`, undefined, true)) ?? {}) as Json;
  }
}
