/**
 * 블록의 과거 자산 곡선을 매매기록으로 되살린다 (#373).
 *
 * 블록 행은 #369 부터 하루 한 점씩 쌓인다. 그 전은 빈칸이고, 점이 하나뿐인 라인은
 * 아무것도 안 그려져 차트에 범례 이름만 뜬다. 그래서 과거를 채운다.
 *
 * 되살리는 건 **보유 평가액뿐**이다 — 블록 장부 현금(v4 cycleCash·VR pool)은 과거값이
 * DB 에 없다. 그래서 이 행은 `backfilled: true` 로 표시하고 `cash` 를 안 적는다.
 * 값은 전부 실측이다: 수량은 그 블록에 귀속된 체결(#372)의 누적, 가격은 stockdailyprices.
 *
 * 라이브 행(close-sync 가 쓴 행)은 **건드리지 않는다**.
 *
 *   node scripts/backfill-block-history.mjs           # 무엇이 생길지 보여만 준다
 *   node scripts/backfill-block-history.mjs --apply   # 실제로 넣는다
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
const { blockValueSeries } = await jiti.import(
  path.resolve(__dirname0, "../src/lib/backfill-block-value.ts"),
);

await mongoose.connect(URI);
const db = mongoose.connection.db;

const accounts = await db.collection("tradingaccounts").find({ isDeleted: { $ne: true } }).toArray();
const envKeyOf = new Map(accounts.map((a) => [String(a._id), a.envKey]));
const ports = await db.collection("tradingportfolios").find({ isDeleted: { $ne: true } }).toArray();

const ops = [];
for (const p of ports) {
  const envKey = envKeyOf.get(String(p.accountId));
  if (!envKey) continue;
  const currency = p.market === "kr" ? "KRW" : "USD";

  const trades = await db.collection("stocktrades")
    .find({ portfolioId: p._id, hidden: { $ne: true } })
    .project({ ticker: 1, date: 1, action: 1, qty: 1, price: 1, _id: 0 })
    .sort({ date: 1, time: 1 })
    .toArray();
  if (!trades.length) {
    console.log(`  ${envKey}/${p.market} ${p.strategy}: 귀속된 매매 없음 — 건너뜀`);
    continue;
  }

  const tickers = [...new Set(trades.map((t) => t.ticker))];
  const priceDocs = await db.collection("stockdailyprices")
    .find({ ticker: { $in: tickers } })
    .project({ ticker: 1, date: 1, close: 1, _id: 0 })
    .toArray();
  const closes = new Map();
  const dateSet = new Set();
  for (const d of priceDocs) {
    if (!closes.has(d.ticker)) closes.set(d.ticker, new Map());
    closes.get(d.ticker).set(d.date, d.close);
    dateSet.add(d.date);
  }
  const dates = [...dateSet].sort();

  const series = blockValueSeries({ trades, closes, dates });
  // 라이브 행이 이미 있는 날은 건드리지 않는다.
  const live = new Set(
    (await db.collection("portfoliohistories")
      .find({ env: envKey, currency, portfolioId: p._id, backfilled: { $ne: true } })
      .project({ dateStr: 1, _id: 0 }).toArray()).map((r) => r.dateStr),
  );
  const 넣을것 = series.filter((s) => !live.has(s.date));

  console.log(
    `  ${envKey}/${p.market} ${p.strategy} [${tickers.join(",")}]: `
    + `${series.length}일 중 ${넣을것.length}일 백필 `
    + `(${series[0]?.date} ~ ${series[series.length - 1]?.date}, 라이브 ${live.size}일 보존)`,
  );
  if (넣을것.length) {
    const 끝 = 넣을것[넣을것.length - 1];
    console.log(`      마지막: ${끝.date}  보유 ${끝.qty}주  평가액 ${Math.round(끝.holdingsValue).toLocaleString()}`);
  }

  for (const s of 넣을것) {
    ops.push({
      updateOne: {
        filter: { env: envKey, currency, portfolioId: p._id, date: `${s.date}T00:00:00.000Z` },
        update: {
          $set: {
            env: envKey, currency, portfolioId: p._id, strategy: p.strategy,
            date: `${s.date}T00:00:00.000Z`, dateStr: s.date,
            holdingsValue: s.holdingsValue, totalValue: s.holdingsValue,
            cash: 0,
            // runPnl·cumulativePnl 은 안 쓴다 (#382) — 블록별 실현손익은 계산하지 않는다.
            // 0 을 넣으면 "손익 0" 이라는 거짓말이 된다. 화면은 없으면 `—` 로 낸다.
            backfilled: true,
          },
          $currentDate: { updatedAt: true },
        },
        upsert: true,
      },
    });
  }
}

console.log(`\n  총 ${ops.length}행`);
if (!APPLY) {
  console.log("\n미리보기입니다. 실제로 넣으려면 --apply 를 붙이세요.");
} else if (ops.length) {
  const res = await db.collection("portfoliohistories").bulkWrite(ops, { ordered: false });
  console.log(`\n적용 완료 — 신규 ${res.upsertedCount}행 · 갱신 ${res.modifiedCount}행`);
} else {
  console.log("\n넣을 것이 없습니다.");
}
await mongoose.disconnect();
