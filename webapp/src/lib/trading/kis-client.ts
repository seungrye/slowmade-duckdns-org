// 한국투자증권(KIS) REST 클라이언트 — 파이썬 stock-automator-v2 kis/{auth,client,
// domestic,overseas}.py 의 TS 포팅(1단계: 추세·LRS·rotation 라이브에 필요한 범위).
//
// - 토큰: Mongo(TradingToken) 캐시 — 블루그린 두 인스턴스가 공유(발급 1분 1회 제한 대응).
// - GET(조회)은 멱등 → 5xx·연결오류 지수백오프 재시도. 토큰 만료(EGW00123)는 강제
//   재발급 후 재시도. POST(주문)는 비멱등이라 토큰 만료(미접수)일 때만 1회 재전송.
// - TR ID 는 모의(V*)/실전이 다르다 — _TR 매핑(파이썬과 동일 값).
// 스펙·함정: stock-automator-v2 docs/kis-api.md

import { connectToDB } from "@/lib/db";
import TradingToken from "@/models/trading-token";
import { krTickRound, type KrTickKind } from "./kr-tick";
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

// (paper, real) — 파이썬 kis/domestic.py·overseas.py _TR 과 동일.
const TR: Record<string, [string, string]> = {
  kr_balance: ["VTTC8434R", "TTTC8434R"],
  kr_buy: ["VTTC0012U", "TTTC0012U"],
  kr_sell: ["VTTC0011U", "TTTC0011U"],
  kr_ccnl: ["VTTC0081R", "TTTC0081R"],
  kr_rvsecncl: ["VTTC0013U", "TTTC0013U"],
  us_buy: ["VTTT1002U", "TTTT1002U"],
  us_sell: ["VTTT1001U", "TTTT1006U"],
  us_balance: ["VTTS3012R", "TTTS3012R"],
  us_psamount: ["VTTS3007R", "TTTS3007R"],
  us_ccnl: ["VTTS3035R", "TTTS3035R"],
  us_nccs: ["VTTS3018R", "TTTS3018R"],
  us_rvsecncl: ["VTTT1004U", "TTTT1004U"],
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

  // ── 토큰 (Mongo 캐시, 23h TTL) ────────────────────────────────

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

  /** 사이클 진입 시 선제 재발급(파이썬 force_refresh 대응). */
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

  /** 유량제한(초당 거래건수 초과) — HTTP 200·rt_cd=1 로 와서 handle 이 throw 하기 전에
   *  재시도로 흡수한다(마감 sync 의 현재가·체결내역 대량 조회가 여기 자주 걸림). */
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
        await sleep(backoffMs(attempt) + 700); // 초당 거래건수 초과 — throttle(1s) 위에 추가 백오프
        continue;
      }
      return { data: KisClient.handle(resp.status, text), trCont: resp.headers.get("tr_cont") ?? "" };
    }
    throw new KisError("retry-exhausted", `GET ${path}`);
  }

  private async get(path: string, trId: string, params: Record<string, string>): Promise<Json> {
    return (await this.getRaw(path, trId, params)).data;
  }

  /** tr_cont 연속조회 자동 병합(파이썬 client.get_paged 대응) — 체결내역·미체결 조회용. */
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
      // 토큰 만료 = 주문 미접수 → 재발급 후 1회만 재전송(중복 위험 없음).
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

  // ── 국내(KR) — 파이썬 kis/domestic.py 포팅 ───────────────────

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

  /** (YYYYMMDD, 종가) 최신순 need+ 건 — 회당 ~100건이라 기간을 옮겨가며 병합. */
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

  /** 최근 일봉 OHLCV(최신순, ~30영업일) — 사이트 가격 push 용. */
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

  /** 거래대금(종가×거래량) 시계열 과거→최신 — rotation 자동선발용(최근 ~30영업일). */
  async krValueSeries(symbol: string): Promise<number[]> {
    const now = new Date();
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10).replace(/-/g, "");
    const rows = await this.krDailyPage(symbol, fmt(new Date(now.getTime() - 60 * 86400_000)), fmt(now));
    return rows
      .map((r) => [String(r.stck_bsop_date), Number(r.stck_clpr) * Number(r.acml_vol ?? 0)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
  }

  /** 보유맵 {symbol: [qty, avg]} + 가용현금(익일정산 nxdy_excc_amt — T+2 미결제 반영). */
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
      hvSum += Number(r.evlu_amt ?? 0); // 종목별 평가금액
    }
    const out2raw = d.output2;
    const out2 = (Array.isArray(out2raw) ? out2raw[0] : out2raw) as Json | undefined;
    const cash = Number(out2?.nxdy_excc_amt ?? out2?.dnca_tot_amt ?? 0);
    const hvBroker = Number(out2?.scts_evlu_amt ?? 0) || hvSum; // 증권사 유가증권평가금액
    return [pos, cash, hvBroker];
  }

  /** 국내 현금 주문 — market=true 시장가(01)/false 지정가(00) → ODNO.
   *  지정가는 KRX 호가단위 라운딩(기본 ETF 5원 — 매도 올림·매수 내림). 위반 시
   *  40030000 "호가단위 오류"로 거부되므로 여기서 단일 처리한다. */
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

  /** 국내 기간 체결내역(체결분만, 매수·매도 전체) — v4 대사용. 날짜 YYYYMMDD. */
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

  /** 국내 당일 미체결(취소 대상) — inquire-daily-ccld 미체결 모드(모의 지원 경로). */
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

  // ── 미국(US) — 파이썬 kis/overseas.py 포팅 ───────────────────

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

  /** 최근 일봉 OHLCV(최신순, ~최근 100일 중 상위) — 사이트 가격 push 용. */
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

  /** 거래대금 시계열 과거→최신(미국) — rotation 자동선발용. */
  async usValueSeries(symbol: string, excd = "NAS"): Promise<number[]> {
    const rows = await this.usDailyPage(symbol, excd, "");
    return rows
      .map((r) => [String(r.xymd), Number(r.clos) * Number(r.tvol ?? 0)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
  }

  /** 미국 보유맵 + 매수가능 USD(psamount — 미체결 반영. 실패 시 현금 0 폴백은 호출측). */
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
    let hvBroker = 0; // 증권사 평가금액 합(우리가 현재가를 재조회하지 않는다)
    for (const r of (d.output1 as Json[]) ?? []) {
      const q = Math.trunc(Number(r.ovrs_cblc_qty ?? 0));
      if (q > 0) pos[String(r.ovrs_pdno)] = [q, Number(r.pchs_avg_pric ?? 0)];
      hvBroker += Number(r.ovrs_stck_evlu_amt ?? 0);
    }
    let cash = 0;
    try {
      cash = await this.usBuyable("SPY", 1.0);
    } catch {
      cash = 0; // 파이썬과 동일: psamount 실패 시 현금 0(매수 스킵) — 보유는 유지
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

  /** 미국 주문 — ordDvsn 00=지정가 / 34=LOC(모의는 LOC 미지원 → 지정가 폴백). */
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

  /** 미국 기간 체결내역(체결분만) — v4 대사용. */
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

  /** 미국 기간 체결내역 — 전 종목(PDNO="")을 거래소별(NASD/NYSE/AMEX)로 일괄 조회·병합.
   *  종목별 조회(수백 종목)보다 훨씬 적은 호출로 전 거래소 체결을 잡는다.
   *  (거래소를 지정하지 않으면 KIS 가 NASD 만 반환 → NYSE 상장 보유의 체결을 놓친다.) */
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

  /** 미국 미체결내역(취소 대상). */
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

// 미장 시세 거래소(EXCD) — stock-automator-v2 universe.py US_ETFS 검증값 + 기본 NAS.
// 심볼→거래소는 계정과 무관한 사실이라 전역 레지스트리로 확장한다(registerUsExcd —
// trend 유니버스의 SYMBOL:EXCD 페어를 엔진이 등록. NYSE 종목이 NAS 로 조회돼 0건이
// 나오는 문제 방지).
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
