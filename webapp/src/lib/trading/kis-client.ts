// Korea Investment & Securities (KIS) REST client - a TS port of stock-automator-v2's kis/{auth,client,
// domestic,overseas}.py (stage 1: what live trend, LRS and rotation need).
//
// - Tokens: cached in Mongo (TradingToken) and shared by both blue/green instances (issuance is capped at one a minute).
// - A GET (read) is idempotent, so 5xx and connection errors retry with exponential backoff. An expired token
//   (EGW00123) forces a reissue and retries. A POST (order) is not idempotent, so it is resent once only when the token expired (never accepted).
// - TR IDs differ between paper (V*) and real - see the _TR map (the same values as Python).
// Spec and pitfalls: stock-automator-v2 docs/kis-api.md

import { connectToDB } from "@/lib/db";
import TradingToken from "@/models/trading-token";
import { krTickRound, type KrTickKind } from "./kr-tick";
import { pickField } from "./buyable";
import { throttle } from "./rate-limit";

export type KisCreds = {
  env: "paper" | "real";
  appKey: string;
  appSecret: string;
  accountNo: string; // "12345678-01"
};

const BASE_URL: Record<KisCreds["env"], string> = {
  paper: "https://openapivts.koreainvestment.com:29443",
  real: "https://openapi.koreainvestment.com:9443",
};

// (paper, real) - the same as _TR in Python's kis/domestic.py and overseas.py.
const TR: Record<string, [string, string]> = {
  kr_balance: ["VTTC8434R", "TTTC8434R"],
  kr_buy: ["VTTC0012U", "TTTC0012U"],
  kr_sell: ["VTTC0011U", "TTTC0011U"],
  kr_ccnl: ["VTTC0081R", "TTTC0081R"],
  kr_rvsecncl: ["VTTC0013U", "TTTC0013U"],
  kr_psbl: ["VTTC8908R", "TTTC8908R"], // 국내 매수가능조회(수수료·세금 반영 수량)
  us_buy: ["VTTT1002U", "TTTT1002U"],
  us_sell: ["VTTT1001U", "TTTT1006U"],
  us_balance: ["VTTS3012R", "TTTS3012R"],
  us_psamount: ["VTTS3007R", "TTTS3007R"],
  us_ccnl: ["VTTS3035R", "TTTS3035R"],
  us_nccs: ["VTTS3018R", "TTTS3018R"],
  us_rvsecncl: ["VTTT1004U", "TTTT1004U"],
  us_period_profit: ["VTTS3039R", "TTTS3039R"], // 해외 기간손익(모의 미지원 — 실계좌만)
  kr_period_profit: ["VTTC8708R", "TTTC8708R"], // 국내 기간별매매손익(모의 미지원 — 실계좌만)
};

const MAX_GET_RETRIES = 4;
const backoffMs = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 8000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class KisError extends Error {
  constructor(public code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

type Json = Record<string, unknown>;

export class KisClient {
  private token: string | null = null;

  constructor(private creds: KisCreds) {}

  private get base(): string {
    return BASE_URL[this.creds.env];
  }
  private get cano(): string {
    return this.creds.accountNo.replace(/-/g, "").slice(0, 8);
  }
  private get prdt(): string {
    return this.creds.accountNo.replace(/-/g, "").slice(8, 10);
  }
  private tr(key: string): string {
    const [paper, real] = TR[key];
    return this.creds.env === "paper" ? paper : real;
  }

  // ── Tokens (Mongo cache, 23h TTL) ────────────────────────────────

  private get cacheKey(): string {
    return `kis:${this.creds.env}:${this.creds.appKey.slice(0, 8)}`;
  }

  private async getToken(force = false): Promise<string> {
    if (this.token && !force) return this.token;
    await connectToDB();
    if (!force) {
      const cached = await TradingToken.findOne({ cacheKey: this.cacheKey }).lean();
      if (cached && cached.expiresAt - 600_000 > Date.now()) {
        this.token = cached.token;
        return this.token;
      }
    }
    await throttle();
    const resp = await fetch(`${this.base}/oauth2/tokenP`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: this.creds.appKey,
        appsecret: this.creds.appSecret,
      }),
    });
    if (!resp.ok) throw new KisError(`http-${resp.status}`, "토큰 발급 실패");
    const body = (await resp.json()) as Json;
    this.token = String(body.access_token);
    await TradingToken.updateOne(
      { cacheKey: this.cacheKey },
      { $set: { token: this.token, expiresAt: Date.now() + 23 * 3600_000 } },
      { upsert: true },
    );
    return this.token;
  }

  /** Pre-emptive reissue at cycle start (matching Python's force_refresh). */
  async forceRefresh(): Promise<void> {
    await this.getToken(true);
  }

  private async headers(trId: string): Promise<Record<string, string>> {
    return {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${await this.getToken()}`,
      appkey: this.creds.appKey,
      appsecret: this.creds.appSecret,
      tr_id: trId,
      custtype: "P",
    };
  }

  private static isTokenExpired(body: string): boolean {
    return body.includes("EGW00123");
  }

  /** Rate limiting (transactions per second exceeded) arrives as HTTP 200 with rt_cd=1, so it is absorbed by a
   *  retry before handle throws (the close sync's bulk price and fill queries hit this often). */
  private static isRateLimited(body: string): boolean {
    return body.includes("초당 거래건수") || body.includes("EGW00201");
  }

  private async getRaw(
    path: string, trId: string, params: Record<string, string>,
    extraHeaders?: Record<string, string>,
  ): Promise<{ data: Json; trCont: string }> {
    const url = `${this.base}${path}?${new URLSearchParams(params)}`;
    let tokenRefreshed = false;
    for (let attempt = 1; attempt <= MAX_GET_RETRIES; attempt++) {
      await throttle();
      let resp: Response;
      try {
        resp = await fetch(url, { headers: { ...(await this.headers(trId)), ...extraHeaders } });
      } catch (e) {
        if (attempt === MAX_GET_RETRIES) throw e;
        await sleep(backoffMs(attempt));
        continue;
      }
      const text = await resp.text();
      if (resp.status >= 500) {
        if (KisClient.isTokenExpired(text) && !tokenRefreshed) {
          tokenRefreshed = true;
          await this.getToken(true);
          continue;
        }
        if (attempt < MAX_GET_RETRIES) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
      if (KisClient.isRateLimited(text) && attempt < MAX_GET_RETRIES) {
        await sleep(backoffMs(attempt) + 700); // transactions per second exceeded - extra backoff on top of the 1s throttle
        continue;
      }
      return { data: KisClient.handle(resp.status, text), trCont: resp.headers.get("tr_cont") ?? "" };
    }
    throw new KisError("retry-exhausted", `GET ${path}`);
  }

  private async get(path: string, trId: string, params: Record<string, string>): Promise<Json> {
    return (await this.getRaw(path, trId, params)).data;
  }

  /** Automatic tr_cont pagination and merging (matching Python's client.get_paged), for fill and open-order queries. */
  private async getPaged(
    path: string, trId: string, params: Record<string, string>,
    outputKey: string, ctxFk: string, ctxNk: string, maxPages = 10,
  ): Promise<Json[]> {
    const rows: Json[] = [];
    const pageParams = { ...params };
    let trContIn = "";
    for (let i = 0; i < maxPages; i++) {
      const { data, trCont } = await this.getRaw(
        path, trId, pageParams, trContIn ? { tr_cont: trContIn } : undefined,
      );
      rows.push(...(((data[outputKey] as Json[]) ?? [])));
      if (!["F", "M"].includes(trCont)) break;
      pageParams[ctxFk] = String(data[ctxFk.toLowerCase()] ?? "").trim();
      pageParams[ctxNk] = String(data[ctxNk.toLowerCase()] ?? "").trim();
      trContIn = "N";
    }
    return rows;
  }

  private async post(path: string, trId: string, body: Json): Promise<Json> {
    const url = `${this.base}${path}`;
    const doPost = async () =>
      fetch(url, { method: "POST", headers: await this.headers(trId), body: JSON.stringify(body) });
    await throttle();
    let resp = await doPost();
    let text = await resp.text();
    if (resp.status >= 500 && KisClient.isTokenExpired(text)) {
      // An expired token means the order was never accepted, so it is resent exactly once after the reissue (no duplication risk).
      await this.getToken(true);
      await throttle();
      resp = await doPost();
      text = await resp.text();
    }
    return KisClient.handle(resp.status, text);
  }

  private static handle(status: number, text: string): Json {
    let data: Json;
    try {
      data = JSON.parse(text) as Json;
    } catch {
      throw new KisError(`http-${status}`, text.slice(0, 120));
    }
    if (status >= 400) {
      throw new KisError(String(data.msg_cd ?? `http-${status}`), String(data.msg1 ?? ""));
    }
    const rt = data.rt_cd;
    if (rt !== undefined && rt !== "0") {
      throw new KisError(String(data.msg_cd ?? "rt_cd"), String(data.msg1 ?? ""));
    }
    return data;
  }

  // ── KRX - a port of Python's kis/domestic.py ───────────────────

  async krPrice(symbol: string): Promise<number> {
    const d = await this.get("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
    });
    return Number((d.output as Json).stck_prpr);
  }

  private async krDailyPage(symbol: string, d1: string, d2: string): Promise<Json[]> {
    const d = await this.get(
      "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
      "FHKST03010100",
      {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: d1,
        FID_INPUT_DATE_2: d2,
        FID_PERIOD_DIV_CODE: "D",
        FID_ORG_ADJ_PRC: "1",
      },
    );
    return ((d.output2 as Json[]) ?? []).filter(
      (r) => r.stck_bsop_date && !["", "0", undefined].includes(r.stck_clpr as string),
    );
  }

  /** need+ (YYYYMMDD, close) pairs, newest first - about 100 per call, so the window is walked and merged. */
  async krHistoryLong(symbol: string, need = 210): Promise<[string, number][]> {
    const out = new Map<string, number>();
    let end = new Date();
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10).replace(/-/g, "");
    for (let i = 0; i < 2 + Math.floor(need / 60); i++) {
      const start = new Date(end.getTime() - 170 * 86400_000);
      const rows = await this.krDailyPage(symbol, fmt(start), fmt(end));
      if (!rows.length) break;
      for (const r of rows) out.set(String(r.stck_bsop_date), Number(r.stck_clpr));
      if (out.size >= need) break;
      const oldest = rows[rows.length - 1].stck_bsop_date as string;
      end = new Date(
        Date.UTC(+oldest.slice(0, 4), +oldest.slice(4, 6) - 1, +oldest.slice(6, 8)) - 86400_000,
      );
    }
    return [...out.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, need + 30);
  }

  /** Recent daily OHLCV (newest first, about 30 trading days), for the site's price push. */
  async krOhlcvRecent(symbol: string): Promise<
    { date: string; open: number; high: number; low: number; close: number; volume: number }[]
  > {
    const now = new Date();
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10).replace(/-/g, "");
    const rows = await this.krDailyPage(symbol, fmt(new Date(now.getTime() - 60 * 86400_000)), fmt(now));
    return rows.map((r) => ({
      date: String(r.stck_bsop_date),
      open: Number(r.stck_oprc ?? 0), high: Number(r.stck_hgpr ?? 0),
      low: Number(r.stck_lwpr ?? 0), close: Number(r.stck_clpr ?? 0),
      volume: Number(r.acml_vol ?? 0),
    }));
  }

  /** Traded value (close x volume) oldest to newest, for rotation's auto-selection (about the last 30 trading days). */
  async krValueSeries(symbol: string): Promise<number[]> {
    const now = new Date();
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10).replace(/-/g, "");
    const rows = await this.krDailyPage(symbol, fmt(new Date(now.getTime() - 60 * 86400_000)), fmt(now));
    return rows
      .map((r) => [String(r.stck_bsop_date), Number(r.stck_clpr) * Number(r.acml_vol ?? 0)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
  }

  /** Holdings map {symbol: [qty, avg]} plus available cash (next-day settlement nxdy_excc_amt, reflecting T+2). */
  async krAccount(): Promise<[Record<string, [number, number]>, number, number]> {
    const d = await this.get("/uapi/domestic-stock/v1/trading/inquire-balance", this.tr("kr_balance"), {
      CANO: this.cano,
      ACNT_PRDT_CD: this.prdt,
      AFHR_FLPR_YN: "N",
      OFL_YN: "",
      INQR_DVSN: "02",
      UNPR_DVSN: "01",
      FUND_STTL_ICLD_YN: "N",
      FNCG_AMT_AUTO_RDPT_YN: "N",
      PRCS_DVSN: "00",
      CTX_AREA_FK100: "",
      CTX_AREA_NK100: "",
    });
    const pos: Record<string, [number, number]> = {};
    let hvSum = 0;
    for (const r of (d.output1 as Json[]) ?? []) {
      const q = Math.trunc(Number(r.hldg_qty ?? 0));
      if (q > 0) pos[String(r.pdno)] = [q, Number(r.pchs_avg_pric ?? 0)];
      hvSum += Number(r.evlu_amt ?? 0); // per-symbol valuation
    }
    const out2raw = d.output2;
    const out2 = (Array.isArray(out2raw) ? out2raw[0] : out2raw) as Json | undefined;
    const cash = Number(out2?.nxdy_excc_amt ?? out2?.dnca_tot_amt ?? 0);
    const hvBroker = Number(out2?.scts_evlu_amt ?? 0) || hvSum; // the broker's securities valuation
    return [pos, cash, hvBroker];
  }

  /** KRX cash order - market=true gives a market order (01), false a limit (00) -> ODNO.
   *  A limit is rounded to the KRX tick (5 won for ETFs by default; up on sells, down on buys). A violation
   *  is rejected with 40030000 "tick size error", so it is handled in this one place. */
  async krOrder(symbol: string, qty: number, side: "buy" | "sell",
                opts: { market?: boolean; price?: number; tick?: KrTickKind } = {}): Promise<string> {
    const market = opts.market ?? true;
    const limitPrice = market ? 0 : krTickRound(opts.price ?? 0, side, opts.tick ?? "etf");
    const d = await this.post("/uapi/domestic-stock/v1/trading/order-cash", this.tr(`kr_${side}`), {
      CANO: this.cano,
      ACNT_PRDT_CD: this.prdt,
      PDNO: symbol,
      ORD_DVSN: market ? "01" : "00",
      ORD_QTY: String(qty),
      ORD_UNPR: market ? "0" : String(limitPrice),
      EXCG_ID_DVSN_CD: "KRX",
      SLL_TYPE: side === "sell" ? "01" : "",
      CNDT_PRIC: "",
    });
    return String((d.output as Json)?.ODNO ?? "");
  }

  async krOrderMarket(symbol: string, qty: number, side: "buy" | "sell"): Promise<string> {
    return this.krOrder(symbol, qty, side, { market: true });
  }

  /** KRX fills over a period (fills only, both sides), for v4 reconciliation. Dates are YYYYMMDD. */
  async krExecutions(symbol: string, startDate: string, endDate: string): Promise<Json[]> {
    return this.getPaged(
      "/uapi/domestic-stock/v1/trading/inquire-daily-ccld", this.tr("kr_ccnl"),
      {
        CANO: this.cano, ACNT_PRDT_CD: this.prdt,
        INQR_STRT_DT: startDate, INQR_END_DT: endDate,
        SLL_BUY_DVSN_CD: "00", INQR_DVSN: "00", PDNO: symbol,
        CCLD_DVSN: "01", ORD_GNO_BRNO: "", ODNO: "",
        INQR_DVSN_3: "00", INQR_DVSN_1: "",
        CTX_AREA_FK100: "", CTX_AREA_NK100: "",
      },
      "output1", "CTX_AREA_FK100", "CTX_AREA_NK100",
    );
  }

  /** KRX open orders today (cancellation candidates) - inquire-daily-ccld in unfilled mode (the path paper supports). */
  async krOpenOrders(): Promise<Json[]> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return this.getPaged(
      "/uapi/domestic-stock/v1/trading/inquire-daily-ccld", this.tr("kr_ccnl"),
      {
        CANO: this.cano, ACNT_PRDT_CD: this.prdt,
        INQR_STRT_DT: today, INQR_END_DT: today,
        SLL_BUY_DVSN_CD: "00", INQR_DVSN: "00", PDNO: "",
        CCLD_DVSN: "02", ORD_GNO_BRNO: "", ODNO: "",
        INQR_DVSN_3: "00", INQR_DVSN_1: "",
        CTX_AREA_FK100: "", CTX_AREA_NK100: "",
      },
      "output1", "CTX_AREA_FK100", "CTX_AREA_NK100",
    );
  }

  async krCancelOrder(orgOdno: string, qty: number): Promise<string> {
    const d = await this.post("/uapi/domestic-stock/v1/trading/order-rvsecncl", this.tr("kr_rvsecncl"), {
      CANO: this.cano, ACNT_PRDT_CD: this.prdt,
      KRX_FWDG_ORD_ORGNO: "", ORGN_ODNO: orgOdno,
      ORD_DVSN: "00", RVSE_CNCL_DVSN_CD: "02",
      ORD_QTY: String(qty), ORD_UNPR: "0",
      QTY_ALL_ORD_YN: "Y", EXCG_ID_DVSN_CD: "KRX",
    });
    return String((d.output as Json)?.ODNO ?? "");
  }

  // ── US - a port of Python's kis/overseas.py ───────────────────

  async usPrice(symbol: string, excd = "NAS"): Promise<number> {
    const d = await this.get("/uapi/overseas-price/v1/quotations/price", "HHDFS00000300", {
      AUTH: "",
      EXCD: excd,
      SYMB: symbol,
    });
    return Number((d.output as Json).last);
  }

  private async usDailyPage(symbol: string, excd: string, bymd: string): Promise<Json[]> {
    const d = await this.get("/uapi/overseas-price/v1/quotations/dailyprice", "HHDFS76240000", {
      AUTH: "",
      EXCD: excd,
      SYMB: symbol,
      GUBN: "0",
      BYMD: bymd,
      MODP: "1",
    });
    return ((d.output2 as Json[]) ?? []).filter((r) => r.xymd && r.clos);
  }

  async usHistoryLong(symbol: string, excd = "NAS", need = 210): Promise<[string, number][]> {
    const out = new Map<string, number>();
    let bymd = "";
    for (let i = 0; i < 2 + Math.floor(need / 90); i++) {
      const rows = await this.usDailyPage(symbol, excd, bymd);
      if (!rows.length) break;
      for (const r of rows) out.set(String(r.xymd), Number(r.clos));
      if (out.size >= need) break;
      const oldest = [...rows].map((r) => String(r.xymd)).sort()[0];
      bymd = String(
        Number(
          new Date(
            Date.UTC(+oldest.slice(0, 4), +oldest.slice(4, 6) - 1, +oldest.slice(6, 8)) - 86400_000,
          )
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, ""),
        ),
      );
    }
    return [...out.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, need + 30);
  }

  /** Recent daily OHLCV (newest first, the top of the last ~100 days), for the site's price push. */
  async usOhlcvRecent(symbol: string, excd = "NAS"): Promise<
    { date: string; open: number; high: number; low: number; close: number; volume: number }[]
  > {
    const rows = await this.usDailyPage(symbol, excd, "");
    return rows.map((r) => ({
      date: String(r.xymd),
      open: Number(r.open ?? 0), high: Number(r.high ?? 0),
      low: Number(r.low ?? 0), close: Number(r.clos ?? 0),
      volume: Number(r.tvol ?? 0),
    }));
  }

  /** Traded value oldest to newest (US), for rotation's auto-selection. */
  async usValueSeries(symbol: string, excd = "NAS"): Promise<number[]> {
    const rows = await this.usDailyPage(symbol, excd, "");
    return rows
      .map((r) => [String(r.xymd), Number(r.clos) * Number(r.tvol ?? 0)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
  }

  /** US holdings map plus buyable USD (psamount, reflecting resting orders. On failure the caller falls back to 0 cash). */
  async usAccount(): Promise<[Record<string, [number, number]>, number, number]> {
    const d = await this.get("/uapi/overseas-stock/v1/trading/inquire-balance", this.tr("us_balance"), {
      CANO: this.cano,
      ACNT_PRDT_CD: this.prdt,
      OVRS_EXCG_CD: "NASD",
      TR_CRCY_CD: "USD",
      CTX_AREA_FK200: "",
      CTX_AREA_NK200: "",
    });
    const pos: Record<string, [number, number]> = {};
    let hvBroker = 0; // the broker's total valuation (we do not re-query current prices)
    for (const r of (d.output1 as Json[]) ?? []) {
      const q = Math.trunc(Number(r.ovrs_cblc_qty ?? 0));
      if (q > 0) pos[String(r.ovrs_pdno)] = [q, Number(r.pchs_avg_pric ?? 0)];
      hvBroker += Number(r.ovrs_stck_evlu_amt ?? 0);
    }
    let cash = 0;
    try {
      cash = await this.usBuyable("SPY", 1.0);
    } catch {
      cash = 0; // Same as Python: a psamount failure gives 0 cash (buys skipped) while the holdings stand
    }
    return [pos, cash, hvBroker];
  }

  async usBuyable(symbol: string, price: number, excd = "NASD"): Promise<number> {
    const d = await this.get(
      "/uapi/overseas-stock/v1/trading/inquire-psamount",
      this.tr("us_psamount"),
      {
        CANO: this.cano,
        ACNT_PRDT_CD: this.prdt,
        OVRS_EXCG_CD: excd,
        OVRS_ORD_UNPR: price.toFixed(2),
        ITEM_CD: symbol,
      },
    );
    const outRaw = d.output;
    const out = (Array.isArray(outRaw) ? outRaw[0] : outRaw) as Json | undefined;
    for (const k of ["ord_psbl_frcr_amt", "frcr_ord_psbl_amt1", "ovrs_ord_psbl_amt", "frcr_ord_psbl_amt"]) {
      const v = out?.[k];
      if (v !== undefined && v !== "") return Number(v);
    }
    const qty = out?.max_ord_psbl_qty;
    if (qty !== undefined && qty !== "") return Number(qty) * price;
    throw new KisError("psamount-unknown", `필드 불명: ${Object.keys(out ?? {}).join(",")}`);
  }

  /** KIS's maximum buyable quantity for a US symbol and price (max_ord_psbl_qty - authoritative, with fees and FX).
   *  The buyable *amount* (usBuyable) is the gross before fees, so floor(amount / price) can exceed the KIS limit
   *  (leveraged ETFs especially). Given a symbol and price, KIS's own quantity is used as is. */
  async usBuyableQty(symbol: string, price: number, excd = "NASD"): Promise<number> {
    const d = await this.get(
      "/uapi/overseas-stock/v1/trading/inquire-psamount",
      this.tr("us_psamount"),
      { CANO: this.cano, ACNT_PRDT_CD: this.prdt, OVRS_EXCG_CD: excd,
        OVRS_ORD_UNPR: price.toFixed(2), ITEM_CD: symbol },
    );
    const outRaw = d.output;
    const out = (Array.isArray(outRaw) ? outRaw[0] : outRaw) as Json | undefined;
    const q = pickField(out, ["max_ord_psbl_qty", "ovrs_max_ord_psbl_qty", "ord_psbl_qty"]);
    if (q !== null) return Math.trunc(q);
    throw new KisError("psamount-qty-unknown", `필드 불명: ${Object.keys(out ?? {}).join(",")}`);
  }

  /** Maximum buyable quantity for a KRX symbol and price (nrcvb_buy_qty - pure cash with no margin, fees and tax included). */
  async krBuyableQty(symbol: string, price: number): Promise<number> {
    const d = await this.get(
      "/uapi/domestic-stock/v1/trading/inquire-psbl-order",
      this.tr("kr_psbl"),
      { CANO: this.cano, ACNT_PRDT_CD: this.prdt, PDNO: symbol,
        ORD_UNPR: String(Math.round(price)), ORD_DVSN: "00",
        CMA_EVLU_AMT_ICLD_YN: "N", OVRS_ICLD_YN: "N" },
    );
    const outRaw = d.output;
    const out = (Array.isArray(outRaw) ? outRaw[0] : outRaw) as Json | undefined;
    const q = pickField(out, ["nrcvb_buy_qty", "max_buy_qty"]);
    if (q !== null) return Math.trunc(q);
    throw new KisError("psbl-qty-unknown", `필드 불명: ${Object.keys(out ?? {}).join(",")}`);
  }

  /** US order - ordDvsn 00 = limit / 34 = LOC (paper has no LOC, so it falls back to a limit). */
  async usOrder(symbol: string, qty: number, price: number, side: "buy" | "sell",
                excd = "NASD", ordDvsn = "00"): Promise<string> {
    const dvsn = this.creds.env === "paper" && ordDvsn !== "00" ? "00" : ordDvsn;
    const d = await this.post("/uapi/overseas-stock/v1/trading/order", this.tr(`us_${side}`), {
      CANO: this.cano,
      ACNT_PRDT_CD: this.prdt,
      OVRS_EXCG_CD: excd,
      PDNO: symbol,
      ORD_QTY: String(qty),
      OVRS_ORD_UNPR: price.toFixed(2),
      CTAC_TLNO: "",
      MGCO_APTM_ODNO: "",
      SLL_TYPE: side === "buy" ? "" : "00",
      ORD_SVR_DVSN_CD: "0",
      ORD_DVSN: dvsn,
    });
    return String((d.output as Json)?.ODNO ?? "");
  }

  /** US fills over a period (fills only), for v4 reconciliation. */
  async usExecutions(symbol: string, startDate: string, endDate: string,
                     excd = "NASD"): Promise<Json[]> {
    return this.getPaged(
      "/uapi/overseas-stock/v1/trading/inquire-ccnl", this.tr("us_ccnl"),
      {
        CANO: this.cano, ACNT_PRDT_CD: this.prdt, PDNO: symbol,
        ORD_STRT_DT: startDate, ORD_END_DT: endDate,
        SLL_BUY_DVSN: "00", CCLD_NCCS_DVSN: "01",
        OVRS_EXCG_CD: excd, SORT_SQN: "AS",
        ORD_DT: "", ORD_GNO_BRNO: "", ODNO: "",
        CTX_AREA_FK200: "", CTX_AREA_NK200: "",
      },
      "output", "CTX_AREA_FK200", "CTX_AREA_NK200",
    );
  }

  /** US fills over a period - every symbol (PDNO="") queried per exchange (NASD/NYSE/AMEX) and merged.
   *  It catches fills on every exchange in far fewer calls than querying hundreds of symbols one by one.
   *  (Without naming an exchange KIS returns NASD only, missing fills on NYSE-listed holdings.) */
  async usExecutionsAll(startDate: string, endDate: string): Promise<Json[]> {
    const out: Json[] = [];
    for (const excd of ["NASD", "NYSE", "AMEX"]) {
      try {
        out.push(...await this.usExecutions("", startDate, endDate, excd));
      } catch {
        // 거래소별 실패는 스킵(부분 결과라도 반영) — 유량제한은 하위 getRaw 가 이미 재시도.
      }
    }
    return out;
  }

  /** Total realized P&L over a period for the US (inquire-period-profit output2), as the broker computed it.
   *  Unsupported on paper, where it throws a KisError (the caller falls back to computing it). */
  async usRealizedPnl(startDate: string, endDate: string): Promise<number> {
    const d = await this.get(
      "/uapi/overseas-stock/v1/trading/inquire-period-profit", this.tr("us_period_profit"),
      {
        CANO: this.cano, ACNT_PRDT_CD: this.prdt, OVRS_EXCG_CD: "%", NATN_CD: "000",
        CRCY_CD: "USD", PDNO: "", INQR_STRT_DT: startDate, INQR_END_DT: endDate,
        WCRC_FRCR_DVSN_CD: "02", CTX_AREA_FK200: "", CTX_AREA_NK200: "",
      },
    );
    const o2 = (Array.isArray(d.output2) ? d.output2[0] : d.output2) as Json | undefined;
    return Number(o2?.ovrs_rlzt_pfls_amt ?? o2?.rlzt_pfls_amt ?? 0);
  }

  /** Total realized P&L over a period for KRX (inquire-period-trade-profit output2). Unsupported on paper, so it throws. */
  async krRealizedPnl(startDate: string, endDate: string): Promise<number> {
    const d = await this.get(
      "/uapi/domestic-stock/v1/trading/inquire-period-trade-profit", this.tr("kr_period_profit"),
      {
        CANO: this.cano, ACNT_PRDT_CD: this.prdt, SORT_DVSN: "00", PDNO: "",
        INQR_STRT_DT: startDate, INQR_END_DT: endDate, CBLC_DVSN: "00",
        CTX_AREA_FK100: "", CTX_AREA_NK100: "",
      },
    );
    const o2 = (Array.isArray(d.output2) ? d.output2[0] : d.output2) as Json | undefined;
    return Number(o2?.tot_rlzt_pfls ?? o2?.rlzt_pfls ?? 0);
  }

  /** US open orders (cancellation candidates). */
  async usOpenOrders(excd = "NASD"): Promise<Json[]> {
    return this.getPaged(
      "/uapi/overseas-stock/v1/trading/inquire-nccs", this.tr("us_nccs"),
      {
        CANO: this.cano, ACNT_PRDT_CD: this.prdt,
        OVRS_EXCG_CD: excd, SORT_SQN: "DS",
        CTX_AREA_FK200: "", CTX_AREA_NK200: "",
      },
      "output", "CTX_AREA_FK200", "CTX_AREA_NK200",
    );
  }

  async usCancelOrder(symbol: string, orgOdno: string, qty: number,
                      excd = "NASD"): Promise<string> {
    const d = await this.post("/uapi/overseas-stock/v1/trading/order-rvsecncl",
                              this.tr("us_rvsecncl"), {
      CANO: this.cano, ACNT_PRDT_CD: this.prdt,
      OVRS_EXCG_CD: excd, PDNO: symbol,
      ORGN_ODNO: orgOdno, RVSE_CNCL_DVSN_CD: "02",
      ORD_QTY: String(qty), OVRS_ORD_UNPR: "0.00",
      MGCO_APTM_ODNO: "", ORD_SVR_DVSN_CD: "0",
    });
    return String((d.output as Json)?.ODNO ?? "");
  }
}

// US quote exchanges (EXCD) - the values verified in stock-automator-v2's universe.py US_ETFS, defaulting to NAS.
// Symbol -> exchange is a fact independent of the account, so it is extensible through a global registry
// (registerUsExcd - the engine registers the trend universe's SYMBOL:EXCD pairs). This stops NYSE symbols
// from being queried as NAS and returning nothing.
export const US_QUOTE_EXCD: Record<string, string> = {
  QQQ: "NAS", TQQQ: "NAS", SQQQ: "NAS",
  SPY: "AMS", VOO: "AMS", UPRO: "AMS",
  SOXL: "AMS", TECL: "AMS", TNA: "AMS", FAS: "AMS", LABU: "AMS",
};

export function registerUsExcd(map: Record<string, string>): void {
  for (const [sym, excd] of Object.entries(map)) {
    if (excd) US_QUOTE_EXCD[sym] = excd;
  }
}

export const usQuoteExcd = (symbol: string): string => US_QUOTE_EXCD[symbol] ?? "NAS";
export const US_ORDER_EXCD: Record<string, string> = { NAS: "NASD", NYS: "NYSE", AMS: "AMEX" };
