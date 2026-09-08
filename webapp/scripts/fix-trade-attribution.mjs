/**
 * Corrects the block attribution of the trade records (#372).
 *
 * close-sync receives **the whole account's fills**, and looping over the blocks tagged every one of them with its own
 * strategy (`$setOnInsert`, so the block that ran first claimed them). It was wrong from day one once VR joined the US account:
 *
 *   2026-09-01 SOXL 64 shares - tradingorderlogs says value_rebalancing, stocktrades says infinite_v4
 *
 * The code is fixed, but strategy is `$setOnInsert` and cannot correct records already stored.
 * This script sweeps through once and repairs them.
 *
 * The judgement uses **the same function as the app** (ownerLookup in `lib/trading/fill-attribution.ts`), loaded
 * directly through jiti - two copies of a rule drift apart.
 *
 *   node scripts/fix-trade-attribution.mjs           # only shows what would change
 *   node scripts/fix-trade-attribution.mjs --apply   # actually fixes
 */
import mongoose from "mongoose";
import path from "node:path";
import url from "node:url";

const APPLY = process.argv.includes("--apply");
const URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/handmade-site";

const __dirname0 = path.dirname(url.fileURLToPath(import.meta.url));
const jitiEntry = path.resolve(
  __dirname0, "..", "node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs",
);
const { createJiti } = await import(url.pathToFileURL(jitiEntry).href);
const jiti = createJiti(url.fileURLToPath(import.meta.url), { interopDefault: true });
const { ownerLookup, contestedSymbols } = await jiti.import(
  path.resolve(__dirname0, "../src/lib/trading/fill-attribution.ts"),
);

await mongoose.connect(URI);
const db = mongoose.connection.db;

const accounts = await db.collection("tradingaccounts").find({ isDeleted: { $ne: true } }).toArray();
const envKeyOf = new Map(accounts.map((a) => [String(a._id), a.envKey]));

const ports = await db.collection("tradingportfolios").find({ isDeleted: { $ne: true } }).toArray();
// Sibling blocks are grouped per (envKey, market) - judging an overlap needs the siblings.
const byScope = new Map();
for (const p of ports) {
  const envKey = envKeyOf.get(String(p.accountId));
  if (!envKey) continue;
  const key = `${envKey}|${p.market}`;
  const block = {
    id: String(p._id),
    strategy: String(p.strategy ?? ""),
    config: p.config ?? {},
    // A fill from before a block existed is not that block's.
    ...(p.createdAt ? { since: new Date(p.createdAt).toISOString().slice(0, 10) } : {}),
  };
  (byScope.get(key) ?? byScope.set(key, []).get(key)).push(block);
}

console.log("── 블록 ──────────────────────────────────────────────");
for (const [scope, blocks] of byScope) {
  console.log(`  ${scope}`);
  for (const b of blocks) {
    console.log(`    ${b.strategy.padEnd(18)} ${JSON.stringify(b.config.symbol ?? b.config.target ?? b.config.universe ?? null)}  since ${b.since ?? "(무제한)"}`);
  }
  const contested = contestedSymbols(blocks);
  if (contested.length) console.log(`    ⚠ 겹치는 종목(귀속 보류): ${contested.join(", ")}`);
}

const lookups = new Map([...byScope].map(([k, v]) => [k, ownerLookup(v)]));
const strategyOfBlock = new Map(ports.map((p) => [String(p._id), String(p.strategy ?? "")]));

// -- Cross-checking against the order log - looking for a mismatch with the strategy that actually placed the order --
const orderStrategies = new Map(); // `${envKey}|${market}|${symbol}` -> Set(strategy)
for (const l of await db.collection("tradingorderlogs").find({}).toArray()) {
  const k = `${l.envKey}|${l.market}|${l.symbol}`;
  (orderStrategies.get(k) ?? orderStrategies.set(k, new Set()).get(k)).add(l.strategy);
}

const trades = await db.collection("stocktrades").find({ hidden: { $ne: true } }).toArray();
const ops = [];
let 손대지않음 = 0;
const 요약 = new Map();

for (const t of trades) {
  const market = t.currency === "KRW" ? "kr" : "us";
  const lookup = lookups.get(`${t.env}|${market}`);
  const own = lookup ? lookup(t.ticker, t.date, t.strategy) : null;
  if (!own) { 손대지않음++; continue; }

  const set = {};
  if (String(t.portfolioId ?? "") !== own.id) set.portfolioId = new mongoose.Types.ObjectId(own.id);
  if (t.strategy !== own.strategy) set.strategy = own.strategy;
  if (!Object.keys(set).length) { 손대지않음++; continue; }

  // A mismatch with the order log is announced loudly (the attribution rule may itself be wrong).
  const 낸전략 = orderStrategies.get(`${t.env}|${market}|${t.ticker}`);
  const 경고 = 낸전략 && 낸전략.size === 1 && !낸전략.has(own.strategy)
    ? `  ⚠ 주문로그는 ${[...낸전략].join("/")}` : "";

  const k = `${t.env}|${t.ticker}|${t.strategy ?? ""}→${own.strategy}`;
  요약.set(k, (요약.get(k) ?? 0) + 1);
  if (경고) console.log(`  ${t.date} ${t.ticker} ${t.action}${경고}`);
  ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: set } } });
}

console.log("\n── 바뀔 것 ──────────────────────────────────────────");
for (const [k, n] of [...요약].sort()) console.log(`  ${n.toString().padStart(4)}건  ${k}`);
console.log(`\n  총 ${ops.length}건 변경 · ${손대지않음}건 그대로(주인 없음 또는 이미 맞음)`);

if (!APPLY) {
  console.log("\n미리보기입니다. 실제로 고치려면 --apply 를 붙이세요.");
} else if (ops.length) {
  const res = await db.collection("stocktrades").bulkWrite(ops, { ordered: false });
  console.log(`\n적용 완료 — ${res.modifiedCount}건 수정`);
} else {
  console.log("\n고칠 것이 없습니다.");
}
await mongoose.disconnect();
