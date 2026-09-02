/**
 * 매매기록의 블록 귀속을 바로잡는다 (#372).
 *
 * close-sync 는 **계좌 전체 체결내역**을 받는데, 블록마다 돌면서 그걸 전부 자기 전략으로
 * 태깅했다(`$setOnInsert` 라 먼저 도는 블록이 선점). 미국 계좌에 VR 이 붙자 첫날부터 틀렸다:
 *
 *   2026-09-01 SOXL 64주 — tradingorderlogs 는 value_rebalancing, stocktrades 는 infinite_v4
 *
 * 코드는 고쳤지만 strategy 는 `$setOnInsert` 라 이미 들어간 기록을 스스로 못 고친다.
 * 이 스크립트가 한 번 훑어 교정한다.
 *
 * 판정은 **앱과 같은 함수**(`lib/trading/fill-attribution.ts` 의 ownerLookup)를 jiti 로
 * 그대로 불러 쓴다 — 규칙을 두 벌 두면 어긋난다.
 *
 *   node scripts/fix-trade-attribution.mjs           # 무엇이 바뀔지 보여만 준다
 *   node scripts/fix-trade-attribution.mjs --apply   # 실제로 고친다
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
// (envKey, market) 별로 형제 블록을 묶는다 — 겹침 판단에 형제가 필요하다.
const byScope = new Map();
for (const p of ports) {
  const envKey = envKeyOf.get(String(p.accountId));
  if (!envKey) continue;
  const key = `${envKey}|${p.market}`;
  const block = {
    id: String(p._id),
    strategy: String(p.strategy ?? ""),
    config: p.config ?? {},
    // 블록이 생기기 전 체결은 그 블록 것이 아니다.
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

// ── 주문 로그로 교차검증 — 실제 주문을 낸 전략과 어긋나는지 본다 ─────────
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

  // 주문 로그와 어긋나면 소리 내어 알린다(귀속 규칙이 틀렸을 수도 있다).
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
