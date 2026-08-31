/**
 * 티커 표기를 점 없는 쪽으로 (#335).
 *
 * `stocks` 에 `BRK.B`·`BF.B` 로 들어간 종목이, 가격(`stockdailyprices`)에는 `BRKB`·`BFB`
 * 로 쌓여 있어 차트에서 고르면 선이 안 그려졌다. 라이브 매매 유니버스와 가격 6,658건이
 * 전부 점 없는 표기라, `stocks` 쪽을 맞춘다.
 *
 * **덮어쓰지 않는다** — 점 없는 표기가 이미 있으면 건너뛴다. 같은 종목이 두 문서로 남는
 * 것이 잘못 합쳐지는 것보다 낫다.
 *
 *   node scripts/fix-ticker-dots.mjs           # 무엇이 바뀔지 보여만 준다
 *   node scripts/fix-ticker-dots.mjs --apply   # 실제로 고친다
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
