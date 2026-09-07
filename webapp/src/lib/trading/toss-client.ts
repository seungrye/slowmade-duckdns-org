// Toss Securities Open API client - a port of stock-automator-v2's Python toss/{auth,client,invest}.py.
// One API for KRX and the US (told apart by symbol: 6 digits = KR, a ticker = US). Live accounts only.
// Spec summary: stock-automator-v2 docs/toss-api.md

import { connectToDB } from "@/lib/db";
import TradingToken from "@/models/trading-token";
import { krTickRound } from "./kr-tick";
import { throttle } from "./rate-limit";
import { feeInclusiveQty } from "./buyable";

export type TossCreds = {
  clientId: string;
  clientSecret: string;
  accountSeq?: number | null; // omitted -> the first BROKERAGE account
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
  private commissionCache: Record<string, number> | null = null;

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
    // Only 401 (never accepted) and 429 (blocked before acceptance) retry once - no other non-idempotent retry.
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

  // ── Domain (matching Python's toss/invest.py) ───────────────────────

  async price(symbol: string): Promise<number> {
    const rows = ((await this.get("/api/v1/prices", { symbols: symbol })) as Json[]) ?? [];
    if (!rows.length) throw new TossError("stock-not-found", symbol);
    return Number(rows[0].lastPrice ?? 0);
  }

  /** (YYYYMMDD, close) newest first, merged across nextBefore pages. */
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

  /** Traded value (close x volume) oldest to newest, for rotation's auto-selection. */
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

  /** Holdings map (filtered by market) plus cash (buying power, KRW|USD). */
  async account(market: "kr" | "us"): Promise<[Record<string, [number, number]>, number, number]> {
    const data = ((await this.get("/api/v1/holdings", undefined, true)) ?? {}) as Json;
    const country = market === "kr" ? "KR" : "US";
    const pos: Record<string, [number, number]> = {};
    let hvBroker = 0; // Toss's valuation (used when the field is there, otherwise 0 -> close-sync falls back)
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

  /** Per-market fee rate (%) - /api/v1/commissions. Queried once and cached (within a cycle). */
  private async commissionRate(market: "kr" | "us"): Promise<number> {
    if (!this.commissionCache) {
      const rows = ((await this.get("/api/v1/commissions", undefined, true)) ?? []) as Json[];
      const map: Record<string, number> = {};
      for (const r of Array.isArray(rows) ? rows : []) {
        const c = String(r.marketCountry ?? "").toUpperCase();
        if (c) map[c] = Number(r.commissionRate ?? 0);
      }
      this.commissionCache = map;
    }
    return this.commissionCache[market === "kr" ? "KR" : "US"] ?? 0;
  }

  /** Buyable quantity for a symbol and price, matching KIS's max_ord_psbl_qty. Toss has no per-symbol maximum API,
   *  so it computes buying power (cashBuyingPower) / (price x (1 + fee rate)), fees included. */
  async buyableQty(symbol: string, price: number, market: "kr" | "us"): Promise<number> {
    if (price <= 0) return 0;
    const bp = ((await this.get(
      "/api/v1/buying-power",
      { currency: market === "kr" ? "KRW" : "USD" },
      true,
    )) ?? {}) as Json;
    const cash = Number(bp.cashBuyingPower ?? 0);
    const rate = await this.commissionRate(market); // a percentage (US is 0.25, say)
    return feeInclusiveQty(cash, price, rate);
  }

  /** Market order -> orderId. clientOrderId is the idempotency key (10 minutes). */
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

  /** Limit order - with cls=true it is an LOC (LIMIT + timeInForce=CLS, US only). Price format:
   *  integer won for KR; two decimals at or above $1 and four below (the same as Python's toss/invest._format_price). */
  async orderLimit(symbol: string, qty: number, side: "buy" | "sell", price: number,
                   opts: { cls?: boolean; clientOrderId?: string } = {}): Promise<string> {
    const priceStr = /^\d+$/.test(symbol)
      ? String(krTickRound(price, side)) // KR: the tick size (5 won for ETFs) - up on sells, down on buys
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

  /** Resting (OPEN) orders, for the cancellation safety net. Toss does not support status=CLOSED yet (400). */
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

  /** Order details in any state, for reconciling fills (execution.filledQuantity and the like). */
  async orderDetail(orderId: string): Promise<Json> {
    return ((await this.get(`/api/v1/orders/${orderId}`, undefined, true)) ?? {}) as Json;
  }
}
