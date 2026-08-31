import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import StockTrade from "@/models/stock-trade";
import PortfolioHistory from "@/models/portfolio-history";
import { appendStrategyChange, type StrategyChange } from "@/lib/trading/strategy-history";

/** 포트폴리오의 (env, currency) 로 매매기록·이력 숨김/복구 토글 — 소프트 삭제.
 *  (env,currency) 단위라 그 통화의 기록을 통째로 가린다. 계정·시장에 블록이 여럿일 수
 *  있으므로(#339) **마지막 블록이 지워질 때만** 부른다 — 호출측 DELETE 참조. */
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
  if (!["lrs_v1", "rotation_v1", "trend_v1", "infinite_v4", "value_rebalancing"].includes(strategy)) {
    return NextResponse.json({ error: "strategy 는 lrs_v1|rotation_v1|trend_v1|infinite_v4|value_rebalancing" }, { status: 400 });
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
  // 계정·시장에 블록을 **여럿** 둘 수 있다 (#339).
  //
  // 예전엔 (accountId, market) 로 upsert 해서, 포트폴리오를 "추가" 하면 기존 것이 조용히
  // 교체됐다(실제로 그렇게 설정 하나를 잃었다). 이제 **portfolioId 가 오면 그것만 수정**,
  // 없으면 **새로 만든다.**
  //
  // 편집이면 state(진행 중 사이클)를 보존하고, 신규일 때만 비운다 — 그래야 새 블록이 옛
  // V4 사이클(T·장부현금)을 물려받지 않는다.
  const portfolioId = typeof body.portfolioId === "string" ? body.portfolioId : null;
  const prev = portfolioId
    ? await TradingPortfolio.findOne({ _id: portfolioId, accountId: body.accountId })
        .select({ isDeleted: 1, strategy: 1, strategyHistory: 1 }).lean()
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
    // 이 블록이 쓸 현금. 0 이면 전액 — 블록이 하나뿐이면 예전과 똑같이 돈다.
    reservedCash,
    // 소프트 삭제됐던 문서를 되살릴 때를 위해.
    isDeleted: false, deletedAt: null,
  };
  // #83 — 전략이 바뀌었을 때만 이력 한 줄. 저장 버튼만 눌러도 여기를 지나므로
  // 같으면 아무것도 하지 않아야 이력이 같은 줄로 도배되지 않는다.
  const prevDoc = prev as { strategy?: string; strategyHistory?: StrategyChange[] } | null;
  const prevHistory = prevDoc?.strategyHistory ?? [];
  const history = appendStrategyChange(prevHistory, prevDoc?.strategy, strategy, new Date());
  if (history !== prevHistory) setFields.strategyHistory = history;
  if (isRecreate) setFields.state = {}; // 재생성/신규 — 사이클 상태 초기화
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
    // 숨김은 (env, currency) 단위라, 블록이 여럿이면 **마지막 하나가 지워질 때만** 숨긴다
    // (#339). 안 그러면 두 블록 중 하나만 지워도 그 통화의 매매기록이 통째로 사라진다.
    const left = await TradingPortfolio.countDocuments({
      accountId: p.accountId, market: p.market, isDeleted: { $ne: true },
    });
    if (left === 0) await setHidden(p.accountId, p.market, true);
  }
  return NextResponse.json({ ok: true });
}
