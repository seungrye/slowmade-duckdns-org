// 자동매매 설정 초기 데이터 로더(서버 전용) — 설정 페이지 SSR 주입 + accounts API 공용.
// 시크릿은 여기서 마스킹돼 클라이언트로는 평문이 절대 나가지 않는다.

import { connectToDB } from "@/lib/db";
import TradingAccount from "@/models/trading-account";
import TradingPortfolio from "@/models/trading-portfolio";
import PortfolioHistory from "@/models/portfolio-history";
import { decryptSecret, maskSecret } from "./crypto";
import type { LiveLogEntry } from "./live-audit";

export type TradingAccountView = {
  id: string;
  broker: "kis" | "toss";
  env: string;
  name: string;
  envKey: string;
  liveEnabled: boolean;
  memo: string;
  credentials: Record<string, string>; // 마스킹 값
  /** 실주문 토글을 마지막으로 바꾼 기록 (#493). 없으면 null. */
  lastLiveChange: { at: string; by: string; enabled: boolean } | null;
};

export type TradingPortfolioView = {
  id: string;
  accountId: string;
  market: "kr" | "us";
  strategy: string;
  runAt: string;
  weekdaysOnly: boolean;
  enabled: boolean;
  /** #495 — 예전엔 이 필드가 여기 없어서 첫 페인트에 "예약 없음(전액)" 으로 잘못 보였다.
   *  API(`/api/my/trading/portfolios`)는 주는데 SSR 만 빠져 두 모양이 어긋나 있었다. */
  reservedCash: number;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
};

/** 계정×통화 → 마지막으로 알려진 현금. 키: `${envKey}:${currency}` (#495).
 *  close-sync 가 매일 적는 값이라 설정 화면이 브로커를 부르지 않아도 된다. */
export type LastCash = Record<string, { cash: number; asOf: string }>;

export type TradingSettingsData = {
  accounts: TradingAccountView[];
  portfolios: TradingPortfolioView[];
  lastCash: LastCash;
  liveAllowed: boolean;
};

/** 실주문 토글 마지막 변경만 뽑는다 — 화면엔 전체 이력이 아니라 이것만 필요하다. */
export function lastLiveChange(
  log: LiveLogEntry[] | null | undefined,
): { at: string; by: string; enabled: boolean } | null {
  const last = (log ?? []).at(-1);
  if (!last) return null;
  return { at: new Date(last.at).toISOString(), by: last.by ?? "", enabled: Boolean(last.enabled) };
}

export function maskedCreds(creds: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, blob] of Object.entries(creds ?? {})) {
    try {
      out[k] = maskSecret(decryptSecret(blob));
    } catch {
      out[k] = "(복호 불가 — 키 변경됨)";
    }
  }
  return out;
}

export async function loadTradingSettings(): Promise<TradingSettingsData> {
  await connectToDB();
  const [accounts, portfolios] = await Promise.all([
    TradingAccount.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean(),
    TradingPortfolio.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 }).lean(),
  ]);
  // 계좌 행(portfolioId 없음)만 — 오름차순이라 같은 키는 마지막(최신)이 남는다.
  const cashRows = await PortfolioHistory.find({
    env: { $in: accounts.map((a) => a.envKey) }, portfolioId: null, hidden: { $ne: true },
  }).select({ env: 1, currency: 1, cash: 1, dateStr: 1, date: 1 }).sort({ date: 1 }).lean();
  const lastCash: LastCash = {};
  for (const r of cashRows) {
    lastCash[`${r.env}:${r.currency}`] = {
      cash: Number(r.cash ?? 0), asOf: String(r.dateStr ?? ""),
    };
  }
  return {
    accounts: accounts.map((a) => ({
      id: String(a._id),
      broker: a.broker as "kis" | "toss",
      env: a.env,
      name: a.name,
      envKey: a.envKey,
      liveEnabled: Boolean(a.liveEnabled),
      memo: a.memo ?? "",
      credentials: maskedCreds(a.credentials as Record<string, string>),
      lastLiveChange: lastLiveChange(a.liveLog as never),
    })),
    portfolios: portfolios.map((p) => ({
      id: String(p._id),
      accountId: String(p.accountId),
      market: p.market as "kr" | "us",
      strategy: p.strategy,
      runAt: p.runAt,
      weekdaysOnly: Boolean(p.weekdaysOnly ?? true),
      enabled: Boolean(p.enabled ?? true),
      reservedCash: Number(p.reservedCash ?? 0) || 0,
      config: (p.config ?? {}) as Record<string, unknown>,
      state: (p.state ?? {}) as Record<string, unknown>,
    })),
    lastCash,
    liveAllowed: process.env.TRADING_LIVE_ALLOWED === "true",
  };
}
