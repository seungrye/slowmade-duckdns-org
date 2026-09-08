/**
 * Moves ticker spellings to the dot-free form (#335).
 *
 * Symbols stored in `stocks` as `BRK.B` and `BF.B` had their prices (`stockdailyprices`) accumulated as `BRKB` and `BFB`,
 * so picking them in the chart drew no line. The live trading universe and all 6,658 price rows
 * use the dot-free spelling, so the `stocks` side is brought into line.
 *
 * **It does not overwrite** - an existing dot-free spelling is skipped. The same symbol left as two documents
 * is better than the two being merged wrongly.
 *
 *   node scripts/fix-ticker-dots.mjs           # only shows what would change
 *   node scripts/fix-ticker-dots.mjs --apply   # actually fixes
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/handmade-site';

await mongoose.connect(URI);
const db = mongoose.connection.db;
const stocks = db.collection('stocks');
const prices = db.collection('stockdailyprices');

const dotted = await stocks.find({ ticker: /\./ }).toArray();
console.log(`점이 든 티커 ${dotted.length}건${APPLY ? '' : ' (미리보기 — 고치려면 --apply)'}`);

let fixed = 0, skipped = 0;
for (const s of dotted) {
  const dotless = s.ticker.replace(/\./g, '');
  const taken = await stocks.findOne({ ticker: dotless });
  const priceCount = await prices.countDocuments({ ticker: dotless });

  if (taken) {
    console.log(`  건너뜀 ${s.ticker} → ${dotless} : 이미 있음(${taken.name})`);
    skipped++;
    continue;
  }
  console.log(`  ${s.ticker} → ${dotless}  (${s.name}, 가격 ${priceCount}건)`);
  if (APPLY) {
    await stocks.updateOne({ _id: s._id }, { $set: { ticker: dotless } });
    fixed++;
  }
}

console.log(APPLY ? `\n고침 ${fixed}건, 건너뜀 ${skipped}건` : `\n대상 ${dotted.length - skipped}건`);
await mongoose.disconnect();
