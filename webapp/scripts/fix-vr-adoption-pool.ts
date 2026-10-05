/**
 * VR 채택 시 잘못 깔린 Pool·cumBuy 를 **실제 체결로** 되돌린다 (#536).
 *
 * 채택 분기가 `pool = 원금 − 평가금` 으로 깔아서 미실현손익이 현금원장에 묻혔다.
 * 코드는 고쳤지만 **이미 저장된 상태는 안 고쳐진다** — `vInit: true` 라 채택 분기를
 * 다시 안 타기 때문이다.
 *
 * 운영 실측(2026-10-05 기준):
 *
 *   stocktrades  2026-10-01  SOXL buy 45 @ $149.345 = $6,720.52
 *   state.vr     pool 418.85 · cumBuy 7581.15 (= 45 × 168.47 평가금)
 *   올바른 값     cumBuy 6720.525 · pool 1279.475 · buyBudget 639.7375
 *
 * Pool 이 $860.62 과소였고, 그래서 매수 사다리가 4칸에서 1칸이 됐다.
 *
 * **V 는 건드리지 않는다** — 밴드 기준값이지 현금원장이 아니다.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/fix-vr-adoption-pool.ts            # 미리보기
 *   pnpm dlx tsx --env-file=.env.local scripts/fix-vr-adoption-pool.ts --apply
 *
 * ⚠ 스케줄러가 도는 중에 돌리지 말 것 — 사이클 한가운데서 장부가 바뀌면 그 날 계산이 섞인다.
 */
import { connectToDB } from "../src/lib/db";
import TradingPortfolio from "../src/models/trading-portfolio";
import TradingAccount from "../src/models/trading-account";
import StockTrade from "../src/models/stock-trade";

const APPLY = process.argv.includes("--apply");

await connectToDB();

const blocks = await TradingPortfolio.find({
  strategy: "value_rebalancing", isDeleted: { $ne: true },
}).lean();

if (!blocks.length) {
  console.log("VR 블록이 없습니다.");
  process.exit(0);
}

let changed = 0;
for (const p of blocks) {
  const vr = (p.state as { vr?: Record<string, unknown> } | undefined)?.vr;
  const sym = (p.config as { symbol?: string } | undefined)?.symbol ?? "";
  const principal = Number((p.config as { principal?: number } | undefined)?.principal ?? 0);
  const label = `${String(p._id)} ${p.market}/${sym}`;
  if (!vr || !sym || !(principal > 0)) { console.log(`${label}: 상태 없음 — 건너뜀`); continue; }

  // **현재 계정의 체결만** 읽는다. 계좌를 옮기면 옛 계정 체결은 이 블록의 원가가 아니다 —
  // 전부 더하면 보유 96(실제 45)이 나온다. stocktrades.env 는 계정 envKey 다.
  const acct = await TradingAccount.findById(p.accountId).select({ envKey: 1 }).lean();
  const envKey = (acct as { envKey?: string } | null)?.envKey;
  if (!envKey) { console.log(`${label}: 계정을 못 찾음 — 건너뜀`); continue; }
  const fills = await StockTrade.find({ ticker: sym, strategy: "value_rebalancing", env: envKey })
    .select({ action: 1, qty: 1, price: 1, time: 1 }).sort({ time: 1 }).lean();
  if (!fills.length) { console.log(`${label}: ${envKey} 체결 기록 없음 — 건너뜀`); continue; }

  let cumBuy = 0, cumSell = 0, qty = 0;
  for (const f of fills) {
    const amt = Number(f.qty) * Number(f.price);
    if (f.action === "buy") { cumBuy += amt; qty += Number(f.qty); }
    else { cumSell += amt; qty -= Number(f.qty); }
  }
  const pool = Math.max(0, principal - cumBuy + cumSell);
  const limit = Number((p.config as { poolLimitPct?: number } | undefined)?.poolLimitPct ?? 0.5);
  const buyBudget = limit * pool;

  // **검산** — 체결로 센 보유가 상태의 보유와 다르면 기록이 불완전한 것이다. 틀린 원가로
  // 덮느니 건너뛴다(조용히 더 나쁜 값을 쓰는 것이 최악이다).
  if (qty !== Number(vr.qty)) {
    console.log(`${label}: ⚠ 체결로 센 보유 ${qty} ≠ 상태 보유 ${vr.qty} — 건너뜀(기록 불완전)`);
    continue;
  }
  const cur = { pool: Number(vr.pool), buyBudget: Number(vr.buyBudget), cumBuy: Number(vr.cumBuy) };
  const same = Math.abs(cur.pool - pool) < 0.01 && Math.abs(cur.cumBuy - cumBuy) < 0.01;
  console.log(`${label}: 체결 ${fills.length}건 → 보유 ${qty} · 취득원가 ${cumBuy.toFixed(2)} · 매도대금 ${cumSell.toFixed(2)}`);
  console.log(`  pool      ${cur.pool.toFixed(2)} → ${pool.toFixed(2)}`);
  console.log(`  buyBudget ${cur.buyBudget.toFixed(2)} → ${buyBudget.toFixed(2)}`);
  console.log(`  cumBuy    ${cur.cumBuy.toFixed(2)} → ${cumBuy.toFixed(2)}  (cumSell → ${cumSell.toFixed(2)})`);
  console.log(`  V ${Number(vr.V).toFixed(2)} · qty ${vr.qty} — 건드리지 않음`);
  if (same) { console.log("  이미 맞음 — 건너뜀"); continue; }
  changed++;

  if (APPLY) {
    await TradingPortfolio.updateOne({ _id: p._id }, {
      $set: {
        "state.vr.pool": pool,
        "state.vr.buyBudget": buyBudget,
        "state.vr.cumBuy": cumBuy,
        "state.vr.cumSell": cumSell,
      },
    });
    console.log("  → 적용됨");
  }
}

console.log(APPLY
  ? `\n적용 완료 — ${changed}개 블록.`
  : `\n미리보기입니다 — ${changed}개 블록이 바뀝니다. 적용하려면 --apply 를 붙이세요.`);
process.exit(0);
