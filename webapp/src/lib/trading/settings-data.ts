// Initial data loader for the trading settings (server only) - SSR injection for the settings page and shared with the accounts API.
// Secrets are masked here, so plaintext never reaches the client.

import { connectToDB } from "@/lib/db";
import TradingAccount from "@/models/trading-account";
import TradingPortfolio from "@/models/trading-portfolio";
import { decryptSecret, maskSecret } from "./crypto";

export type TradingAccountView = {
  id: string;
  broker: "kis" | "toss";
  env: string;
  name: string;
  envKey: string;
  liveEnabled: boolean;
  memo: string;
  credentials: Record<string, string>; // the masked value
};

export type TradingPortfolioView = {
  id: string;
  accountId: string;
  market: "kr" | "us";
  strategy: string;
  runAt: string;
  weekdaysOnly: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
};

export type TradingSettingsData = {
  accounts: TradingAccountView[];
  portfolios: TradingPortfolioView[];
  liveAllowed: boolean;
};

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
    })),
    portfolios: portfolios.map((p) => ({
      id: String(p._id),
      accountId: String(p.accountId),
      market: p.market as "kr" | "us",
      strategy: p.strategy,
      runAt: p.runAt,
      weekdaysOnly: Boolean(p.weekdaysOnly ?? true),
      enabled: Boolean(p.enabled ?? true),
      config: (p.config ?? {}) as Record<string, unknown>,
      state: (p.state ?? {}) as Record<string, unknown>,
    })),
    liveAllowed: process.env.TRADING_LIVE_ALLOWED === "true",
  };
}
