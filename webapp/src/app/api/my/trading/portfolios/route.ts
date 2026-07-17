import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import StockTrade from "@/models/stock-trade";
import PortfolioHistory from "@/models/portfolio-history";

/** 포트폴리오의 (env, currency) 로 매매기록·이력 숨김/복구 토글 — 소프트 삭제.
 *  (accountId, market) 이 unique 라 (env,currency)당 포트폴리오는 유일 → 다른 블록 안 건드림. */
async function setHidden(accountId: unknown, market: string, hidden: boolean): Promise<void> {
  const acct = await TradingAccount.findById(accountId).select({ envKey: 1 }).lean();
  const env = (acct as { envKey?: string } | null)?.envKey;
  if (!env) return;
  const currency = market === "kr" ? "KRW" : "USD";
  // 복구(hidden=false)는 숨겨진 것만 대상, 숨김(true)은 전체 대상.
  const filter = hidden ? { env, currency } : { env, currency, hidden: true };
  await Promise.all([
    StockTrade.updateMany(filter, { $set: { hidden } }),
    PortfolioHistory.updateMany(filter, { $set: { hidden } }),
  ]);
}

export const dynamic = "force-dynamic";

/** 포트폴리오 블록(계정×시장×전략) CRUD — owner 전용. */

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
  if (!["lrs_v1", "rotation_v1", "trend_v1", "infinite_v4"].includes(strategy)) {
    return NextResponse.json({ error: "strategy 는 lrs_v1|rotation_v1|trend_v1|infinite_v4" }, { status: 400 });
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
  // 계정당 시장 1블록 — upsert. 라이브 블록 *편집* 시엔 state(진행 중 사이클)를 보존하고,
  // *재생성*(신규 or 소프트 삭제됐던 걸 되살림)일 때만 state 를 초기화한다 — 그래야 지웠다
  // 다시 만든 포트폴리오가 옛 V4 사이클(T·장부현금)을 이어가지 않고 깨끗하게 시작한다.
  const prev = await TradingPortfolio.findOne({ accountId: body.accountId, market })
    .select({ isDeleted: 1 }).lean();
  const isRecreate = !prev || (prev as { isDeleted?: boolean }).isDeleted === true;
  const setFields: Record<string, unknown> = {
    strategy, runAt,
    weekdaysOnly: body.weekdaysOnly !== false,
    enabled: body.enabled !== false,
    config: body.config ?? {},
    // 소프트 삭제됐던 (accountId,market) 문서를 재생성 시 재사용(undelete).
    isDeleted: false, deletedAt: null,
  };
  if (isRecreate) setFields.state = {}; // 재생성/신규 — 사이클 상태 초기화
  const doc = await TradingPortfolio.findOneAndUpdate(
    { accountId: body.accountId, market },
    { $set: setFields },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  // 재생성 시 옛 기록을 자동 복구하지 않는다 — 지운 포트폴리오를 같은 계정·시장으로 다시
  // 만들면 '깨끗한 새 차트'를 기대하므로(#피드백). 숨김은 삭제 시점에 고정되고, 복구가
  // 필요하면 수동으로 hidden 을 되돌린다.
  return NextResponse.json({ id: String(doc._id) });
}

export async function DELETE(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const id = String(new URL(req.url).searchParams.get("id") ?? "");
  await connectToDB();
  const pf = await TradingPortfolio.findById(id).select({ accountId: 1, market: 1 }).lean();
  // 하드 삭제하지 않고 소프트 삭제 — 문서는 남기고 isDeleted 로 숨긴다(스케줄러·목록에서 제외).
  await TradingPortfolio.updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  // 매매기록·이력도 하드 삭제하지 않고 숨김. 재생성해도 자동 복구되지 않으며(POST 참조),
  // 복구가 필요하면 수동으로 hidden 을 되돌린다.
  if (pf) {
    const p = pf as { accountId: unknown; market: string };
    await setHidden(p.accountId, p.market, true);
  }
  return NextResponse.json({ ok: true });
}
