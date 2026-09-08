/**
 * Rebuilds a block's past asset curve from the trade records (#373).
 *
 * Block rows accumulate one point a day from #369 on. Before that they are blank, and a line with a single
 * point draws nothing, leaving only the legend's name on the chart. So the past is filled in.
 *
 * Only **the holdings' value** is rebuilt - the block's book cash (v4's cycleCash, VR's pool) has no past value
 * in the DB. So these rows are marked `backfilled: true` and carry no `cash`.
 * Every value is measured: the quantity is the cumulative total of fills attributed to that block (#372), the price comes from stockdailyprices.
 *
 * Live rows (those written by close-sync) are **left alone**.
 *
 *   node scripts/backfill-block-history.mjs           # only shows what would be created
 *   node scripts/backfill-block-history.mjs --apply   # actually inserts
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
  // A day that already has a live row is left alone.
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
            // runPnl and cumulativePnl are unused (#382) - realised profit is not computed per block.
            // Writing 0 would be the lie "zero profit". The screen shows an em dash when it is absent.
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
