import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { validateStrategyConfig } from "@/lib/trading/config-validate";
import { connectToDB } from "@/lib/db";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import StockTrade from "@/models/stock-trade";
import PortfolioHistory from "@/models/portfolio-history";
import TradingPortfolioRevision from "@/models/trading-portfolio-revision";
import { snapshotOf, changedKeys } from "@/lib/trading/portfolio-revision";
import { planStateReset } from "@/lib/trading/state-reset";
import TradingRun from "@/models/trading-run";
import TradingOrderLog from "@/models/trading-order-log";
import { LIVE_STRATEGY_IDS, isLiveStrategy } from "@/types/trading";

/**
 * 설정이 바뀐 순간의 값을 한 줄 남긴다 (#350).
 *
 * #348 에서 전략을 갈아타자 예전 config 가 통째로 덮여 사라졌다. 백업도 oplog 도 없어
 * 주문로그·체결에서 역산해야 했고, 그러고도 원금은 구간까지만 좁혀졌다.
 *
 * **기록 실패는 삼킨다** — 이력 때문에 설정 저장이 실패하면 안 된다(원장·메일과 같은 원칙).
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
  // #354 — 목록과 에러 메시지가 각각 문자열을 들고 있었다. 이제 둘 다 단일 출처에서 나온다.
  if (!isLiveStrategy(strategy)) {
    return NextResponse.json({ error: `strategy 는 ${LIVE_STRATEGY_IDS.join("|")}` }, { status: 400 });
  }
  const runAt = String(body.runAt ?? (market === "kr" ? "09:05" : "09:35"));
  if (!/^\d{2}:\d{2}$/.test(runAt)) {
    return NextResponse.json({ error: "runAt 은 HH:MM" }, { status: 400 });
  }
  await connectToDB();
  // config 의 숫자 필드를 검증한다 (#507). 예전엔 필수 몇 개만 봐서 `splits: 0` 이나
  // `sellTarget: ""` 이 그대로 저장되고 **주문 파라미터가 됐다** — `??` 는 빈문자열을
  // 못 막는다(`Number("") === 0`, #491 과 같은 계열). 여기서 막는 게 가장 싸다.
  const cfgErr = validateStrategyConfig(strategy, (body.config ?? {}) as Record<string, unknown>);
  if (cfgErr) return NextResponse.json({ error: cfgErr }, { status: 400 });
  // 계정·시장에 블록을 **여럿** 둘 수 있다 (#339).
  //
  // 예전엔 (accountId, market) 로 upsert 해서, 포트폴리오를 "추가" 하면 기존 것이 조용히
  // 교체됐다(실제로 그렇게 설정 하나를 잃었다). 이제 **portfolioId 가 오면 그것만 수정**,
  // 없으면 **새로 만든다.**
  //
  // 편집이면 state(진행 중 사이클)를 보존하고, 신규일 때만 비운다 — 그래야 새 블록이 옛
  // V4 사이클(T·장부현금)을 물려받지 않는다.
  const portfolioId = typeof body.portfolioId === "string" ? body.portfolioId : null;
  // accountId 는 **조회 키가 아니다** (#515). 예전엔 필터에 들어 있어서, 편집 폼에서 계정을
  // 바꿔 저장하면 `(_id, 새 accountId)` 로 찾다가 못 찾고 404 가 났다 — UI 는 바꿀 수 있는
  // 것처럼 보여 주는데 서버가 조용히 거절하는 모양이었다. 이 라우트는 requireOwner() 로
  // 전체가 owner 전용이라 accountId 가 필터에 있어야 할 보안상 이유도 없다.
  //
  // select 에 accountId·state 가 **반드시** 있어야 한다. 없으면 아래 이동 판정이
  // `undefined !== "acc-2"` 로 **항상 참**이 되어 평범한 저장·활성 토글까지 이동으로 읽고,
  // planStateReset 은 undefined 를 받아 아카이브 없이 상태를 날린다.
  const prev = portfolioId
    ? await TradingPortfolio.findOne({ _id: portfolioId })
        // 리비전을 남기려면 이전 값 전체가 필요하다 — 무엇이 바뀌었는지 대조해야 한다.
        .select({
          isDeleted: 1, accountId: 1, market: 1, strategy: 1, runAt: 1,
          weekdaysOnly: 1, enabled: 1, reservedCash: 1, config: 1, state: 1,
        }).lean()
    : null;
  if (portfolioId && !prev) {
    return NextResponse.json({ error: "포트폴리오를 찾을 수 없습니다" }, { status: 404 });
  }
  // market 은 편집으로 못 바꾼다 (#515). 예전엔 setFields 에 market 이 없어 **runAt 만**
  // 저장됐다 — 미장 블록이 09:30 을 ET 로, 국장 블록이 09:35 를 KST 로 해석해 실행 시각만
  // 조용히 옮겨졌고(scheduler 는 DB 의 market 을 본다), 리비전에는 바뀐 것처럼 거짓으로
  // 남았다. 조용히 무시하느니 거절한다 — 시장을 바꾸려면 새 블록을 만들어야 한다.
  const prevMarket = String((prev as { market?: string } | null)?.market ?? "");
  if (prev && !(prev as { isDeleted?: boolean }).isDeleted && prevMarket && prevMarket !== market) {
    return NextResponse.json(
      { error: "시장(kr/us)은 편집으로 바꿀 수 없습니다 — 새 블록으로 만드세요" }, { status: 400 },
    );
  }
  const isRecreate = !prev || (prev as { isDeleted?: boolean }).isDeleted === true;

  // ── 계좌 이동 (#515) ────────────────────────────────────────────
  //
  // **명시 의도(moveAccount)일 때만** 옮긴다. 그냥 "accountId 가 다르면 이동" 으로 하면
  // 활성/비활성 토글도 accountId 를 싣기 때문에 **모든 POST 가 이동 명령**이 된다 —
  // 탭 두 개를 열어 두고 한쪽에서 옮긴 뒤 다른 쪽에서 토글만 눌러도 계좌가 되돌아가고
  // 상태가 또 초기화된다.
  const nextAccountId = typeof body.accountId === "string" ? body.accountId : "";
  const prevAccountId = String((prev as { accountId?: unknown } | null)?.accountId ?? "");
  const wantsMove = body.moveAccount === true && !!prev
    && !!nextAccountId && nextAccountId !== prevAccountId;
  if (wantsMove) {
    const p = prev as { enabled?: boolean; market?: string };
    // ① 켜져 있으면 안 된다 — 장중에 옮기면 사이클이 두 계좌로 쪼개지고, 옛 계좌에 건
    //    익절 지정가가 체결돼도 어느 상태에도(대사는 새 계좌만 본다) 어느 원장에도
    //    (close-sync 는 새 envKey 로 쓴다) 안 잡힌다.
    if (p.enabled !== false) {
      return NextResponse.json(
        { error: "계좌를 옮기려면 먼저 이 블록을 비활성화하세요 (장 시간 밖 권장)" },
        { status: 409 },
      );
    }
    // ② 오늘 **접수된 주문**이 있으면 안 된다 — 옛 계좌에 걸린 지정가·LOC 가 고아가 된다.
    //
    // 런이 돌았다는 사실만으로 막으면 안 된다 (#517). 실측 2026-09-30 미장 사이클은
    // 16건을 계획했지만 계좌 만료로 **전부 거부돼 접수 0건**이었다 — 고아가 될 주문이
    // 없는데 막으면 계좌를 못 옮겨 그 문제를 고칠 수가 없다. 기준은 #511 의 재시도
    // 가드와 같다: **실제로 접수된 주문(orderNo 가 있는 것)** 만 센다.
    const tz = p.market === "kr" ? "Asia/Seoul" : "America/New_York";
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const todayRuns = await TradingRun.find({ portfolioId, dateKey }).select({ _id: 1 }).lean();
    if (todayRuns.length) {
      const accepted = await TradingOrderLog.countDocuments({
        runId: { $in: todayRuns.map((r) => r._id) },
        dryRun: false, orderNo: { $nin: ["", null] },
      });
      if (accepted) {
        return NextResponse.json(
          { error: `오늘(${dateKey}) 접수된 주문 ${accepted}건이 옛 계좌에 있습니다 — `
            + "정리한 뒤 다음 거래일에 옮기세요" },
          { status: 409 },
        );
      }
    }
    // ③ 대상 계정이 실존해야 한다 — 없으면 스케줄러가 아무 말 없이 건너뛴다(매매 정지).
    const target = await TradingAccount.findById(nextAccountId)
      .select({ envKey: 1, isDeleted: 1 }).lean();
    if (!target || (target as { isDeleted?: boolean }).isDeleted) {
      return NextResponse.json({ error: "대상 계정을 찾을 수 없습니다" }, { status: 400 });
    }
  }

  // 상태를 물려주면 안 되는 변경 = **전략 정체성이 바뀐 것** (#515). 계좌만의 문제가 아니다 —
  // symbol 만 바꿔도 보유 0인 새 종목이 옛 T·장부현금을 물려받아 '3회차 진행 중' 처럼 주문한다.
  const prevSymbol = String(((prev as { config?: { symbol?: unknown } } | null)?.config?.symbol) ?? "");
  const nextSymbol = String(((body.config ?? {}) as { symbol?: unknown }).symbol ?? "");
  const identityChanged = !!prev && !isRecreate && (
    wantsMove
    || String((prev as { strategy?: string }).strategy) !== strategy
    // 양쪽에 symbol 이 있을 때만 본다 — trend_v1 처럼 symbol 이 없는 전략에서
    // "" vs "" 는 같고, 한쪽만 있는 경우는 strategy 변경 쪽이 이미 잡는다.
    || (!!prevSymbol && !!nextSymbol && prevSymbol !== nextSymbol)
  );
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
  if (isRecreate) setFields.state = {}; // 재생성/신규 — 사이클 상태 초기화
  if (wantsMove) setFields.accountId = nextAccountId;
  if (identityChanged) {
    // 지우지 않고 state.archive 로 옮긴다(#513). patch 가 없으면(옮길 것이 없으면)
    // **아무것도 $set 하지 않는다** — 빈 객체로 덮으면 아카이브 없는 유실이 된다.
    const plan = planStateReset(
      (prev as { state?: Record<string, unknown> }).state,
      { at: new Date().toISOString(), reason: wantsMove ? "계좌 교체" : "전략·종목 변경" },
    );
    if (plan.patch) setFields.state = plan.patch.state;
  }
  const doc = portfolioId
    ? await TradingPortfolio.findOneAndUpdate(
        { _id: portfolioId },
        { $set: setFields },
        { new: true },
      )
    : await TradingPortfolio.create({ accountId: body.accountId, market, ...setFields });
  if (!doc) {
    return NextResponse.json({ error: "포트폴리오를 찾을 수 없습니다" }, { status: 404 });
  }
  // 값이 바뀐 경우에만 리비전 한 줄 (#350). **안 바뀌면 안 남긴다** — 저장 버튼만 눌러도
  // 여기를 지나므로, 그러지 않으면 같은 값이 도배돼 이력이 쓸모없어진다.
  // accountId 를 스냅샷에 싣는다 (#515). 예전엔 SETTING_KEYS 에 없어서 **계좌만 바꾸면
  // changed 가 빈 배열**이 되고 리비전이 아예 안 남았다 — 가장 위험한 변경(계좌 교체 +
  // 상태 아카이브)이 감사 흔적 0건으로 지나갔다.
  const after = snapshotOf({
    market, accountId: prev ? (wantsMove ? nextAccountId : prevAccountId) : nextAccountId,
    ...setFields,
  });
  const changed = prev
    ? changedKeys(snapshotOf({ ...(prev as Record<string, unknown>), accountId: prevAccountId }), after)
    : [];
  if (!prev || changed.length > 0) {
    await recordRevision(doc._id, doc.accountId, prev ? "update" : "create", after, changed);
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
  const pf = await TradingPortfolio.findById(id).select({
    accountId: 1, market: 1, strategy: 1, runAt: 1,
    weekdaysOnly: 1, enabled: 1, reservedCash: 1, config: 1,
  }).lean();
  // 하드 삭제하지 않고 소프트 삭제 — 문서는 남기고 isDeleted 로 숨긴다(스케줄러·목록에서 제외).
  await TradingPortfolio.updateOne({ _id: id }, { $set: { isDeleted: true, deletedAt: new Date() } });
  // 지워질 때의 값을 남긴다 (#350) — 지운 블록의 설정을 나중에 다시 볼 수 있게.
  if (pf) {
    const p = pf as Record<string, unknown>;
    await recordRevision(id, p.accountId, "delete", snapshotOf(p), []);
  }
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
