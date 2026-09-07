import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import StockTrade from "@/models/stock-trade";
import PortfolioHistory from "@/models/portfolio-history";
import TradingPortfolioRevision from "@/models/trading-portfolio-revision";
import { snapshotOf, changedKeys } from "@/lib/trading/portfolio-revision";
import { LIVE_STRATEGY_IDS, isLiveStrategy } from "@/types/trading";

/**
 * Records one line with the values at the moment the settings changed (#350).
 *
 * In #348, switching strategy overwrote the old config wholesale and lost it. With no backup and no oplog it had to be
 * reverse-engineered from the order log and the fills, and even then the principal was only narrowed to a band.
 *
 * **A failed record is swallowed** - the history must never fail a settings save (the same principle as the ledger and mail).
 */
async function recordRevision(
  portfolioId: unknown, accountId: unknown,
  action: "create" | "update" | "delete",
  snapshot: unknown, changed: string[],
): Promise<void> {
  try {
    const last = await TradingPortfolioRevision.findOne({ portfolioId })
      .sort({ version: -1 }).select({ version: 1 }).lean();
    await TradingPortfolioRevision.create({
      portfolioId, accountId, action, snapshot, changed,
      version: ((last as { version?: number } | null)?.version ?? 0) + 1,
      createdAt: new Date(),
    });
  } catch (e) {
    console.error("[trading] 리비전 기록 실패 — 설정 저장은 계속한다", e);
  }
}

/** Toggles hiding and restoring the trade records and history for the portfolio's (env, currency) - a soft delete.
 *  Being per (env, currency), it hides that currency's records wholesale. An account and market can hold several
 *  blocks (#339), so this is called **only when the last block is deleted** - see the caller's DELETE. */
async function setHidden(accountId: unknown, market: string, hidden: boolean): Promise<void> {
  const acct = await TradingAccount.findById(accountId).select({ envKey: 1 }).lean();
  const env = (acct as { envKey?: string } | null)?.envKey;
  if (!env) return;
  const currency = market === "kr" ? "KRW" : "USD";
  // Restoring (hidden=false) targets only what is hidden; hiding (true) targets everything.
  const filter = hidden ? { env, currency } : { env, currency, hidden: true };
  await Promise.all([
    StockTrade.updateMany(filter, { $set: { hidden } }),
    PortfolioHistory.updateMany(filter, { $set: { hidden } }),
  ]);
}

export const dynamic = "force-dynamic";

/** Portfolio block (account x market x strategy) CRUD - owner only. */

export async function GET(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const accountId = new URL(req.url).searchParams.get("accountId");
  await connectToDB();
  const q: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (accountId) q.accountId = accountId;
  const rows = await TradingPortfolio.find(q).sort({ createdAt: 1 }).lean();
  return NextResponse.json({
    portfolios: rows.map((p) => ({
      id: String(p._id),
      accountId: String(p.accountId),
      market: p.market,
      strategy: p.strategy,
      runAt: p.runAt,
      weekdaysOnly: p.weekdaysOnly,
      enabled: p.enabled,
      reservedCash: Number(p.reservedCash ?? 0),
      config: p.config ?? {},
      state: p.state ?? {},
    })),
  });
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const body = await req.json();
  const market = String(body.market ?? "");
  const strategy = String(body.strategy ?? "");
  if (!["kr", "us"].includes(market)) {
    return NextResponse.json({ error: "market 은 kr|us" }, { status: 400 });
  }
  // #354 - the list and the error message each held their own strings. Both now come from one source.
  if (!isLiveStrategy(strategy)) {
    return NextResponse.json({ error: `strategy 는 ${LIVE_STRATEGY_IDS.join("|")}` }, { status: 400 });
  }
  const runAt = String(body.runAt ?? (market === "kr" ? "09:05" : "09:35"));
  if (!/^\d{2}:\d{2}$/.test(runAt)) {
    return NextResponse.json({ error: "runAt 은 HH:MM" }, { status: 400 });
  }
  await connectToDB();
  if (strategy === "infinite_v4") {
    const cfg = (body.config ?? {}) as Record<string, unknown>;
    if (!cfg.symbol || !(Number(cfg.principal) > 0)) {
      return NextResponse.json({ error: "infinite_v4 는 config.symbol·principal(양수) 필수" }, { status: 400 });
    }
  }
  if (strategy === "value_rebalancing") {
    const cfg = (body.config ?? {}) as Record<string, unknown>;
    if (!cfg.symbol || !(Number(cfg.principal) > 0) || !(Number(cfg.gradient) > 0)) {
      return NextResponse.json({ error: "value_rebalancing 은 config.symbol·principal(양수)·gradient(양수) 필수" }, { status: 400 });
    }
  }
  // An account and market can hold **several** blocks (#339).
  //
  // It used to upsert on (accountId, market), so "adding" a portfolio quietly replaced the existing one
  // (which really did lose one configuration). Now **a portfolioId means editing that one**,
  // and its absence means **creating a new one.**
  //
  // An edit preserves state (the running cycle) and only a new one clears it - so a new block never inherits an old
  // V4 cycle (its T and ledger cash).
  const portfolioId = typeof body.portfolioId === "string" ? body.portfolioId : null;
  const prev = portfolioId
    ? await TradingPortfolio.findOne({ _id: portfolioId, accountId: body.accountId })
        // 리비전을 남기려면 이전 값 전체가 필요하다 — 무엇이 바뀌었는지 대조해야 한다.
        .select({
          isDeleted: 1, market: 1, strategy: 1, runAt: 1,
          weekdaysOnly: 1, enabled: 1, reservedCash: 1, config: 1,
        }).lean()
    : null;
  if (portfolioId && !prev) {
    return NextResponse.json({ error: "포트폴리오를 찾을 수 없습니다" }, { status: 404 });
  }
  const isRecreate = !prev || (prev as { isDeleted?: boolean }).isDeleted === true;
  const reservedCash = Math.max(0, Number(body.reservedCash ?? 0) || 0);
  const setFields: Record<string, unknown> = {
    strategy, runAt,
    weekdaysOnly: body.weekdaysOnly !== false,
    enabled: body.enabled !== false,
    config: body.config ?? {},
    // The cash this block may use. 0 means everything - with a single block it runs exactly as before.
    reservedCash,
    // For when a soft-deleted document is revived.
    isDeleted: false, deletedAt: null,
  };
  if (isRecreate) setFields.state = {}; // Recreated or new - the cycle state is reset
  const doc = portfolioId
    ? await TradingPortfolio.findOneAndUpdate(
        { _id: portfolioId, accountId: body.accountId },
        { $set: setFields },
        { new: true },
      )
    : await TradingPortfolio.create({ accountId: body.accountId, market, ...setFields });
  if (!doc) {
    return NextResponse.json({ error: "포트폴리오를 찾을 수 없습니다" }, { status: 404 });
  }
  // One revision line only when a value actually changed (#350). **Unchanged writes nothing** - a mere save-button
  // press passes through here, and without this the same value would fill the history and make it useless.
  const after = snapshotOf({ market, ...setFields });
  const changed = prev ? changedKeys(snapshotOf(prev as Record<string, unknown>), after) : [];
  if (!prev || changed.length > 0) {
    await recordRevision(doc._id, body.accountId, prev ? "update" : "create", after, changed);
  }
  // Recreating does not automatically restore the old records - recreating a deleted portfolio on the same account and
  // market means expecting 'a clean new chart' (per the feedback). Hiding is fixed at deletion time, and a restore
  // means reverting hidden by hand.
  return NextResponse.json({ id: String(doc._id) });
}

export async function DELETE(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const id = String(new URL(req.url).searchParams.get("id") ?? "");
  await connectToDB();
  const pf = await TradingPortfolio.findById(id).select({
    accountId: 1, market: 1, strategy: 1, runAt: 1,
    weekdaysOnly: 1, enabled: 1, reservedCash: 1, config: 1,
  }).lean();
  // A soft delete rather than a hard one - the document stays and isDeleted hides it (excluded from the scheduler and the lists).
  await TradingPortfolio.updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  // The values at deletion are recorded (#350) - so a deleted block's settings remain readable later.
  if (pf) {
    const p = pf as Record<string, unknown>;
    await recordRevision(id, p.accountId, "delete", snapshotOf(p), []);
  }
  // The trade records and history are hidden rather than hard deleted. Recreating does not restore them (see POST),
  // and a restore means reverting hidden by hand.
  if (pf) {
    const p = pf as { accountId: unknown; market: string };
    // Hiding is per (env, currency), so with several blocks it hides **only when the last one is deleted**
    // (#339). Otherwise deleting one of two blocks would wipe that currency's trade records wholesale.
    const left = await TradingPortfolio.countDocuments({
      accountId: p.accountId, market: p.market, isDeleted: { $ne: true },
    });
    if (left === 0) await setHidden(p.accountId, p.market, true);
  }
  return NextResponse.json({ ok: true });
}
