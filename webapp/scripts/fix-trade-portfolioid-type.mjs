/**
 * Restores stocktrades.portfolioId **stored as a string** to an ObjectId (#384).
 *
 * `upsertTrades` uses `StockTrade.collection.bulkWrite` (the raw driver) - there is no mongoose casting there,
 * so the `String(_id)` the attribution (#372) passed was stored as a string.
 * Lookups (`StockTrade.find({ portfolioId })`), meanwhile, cast to an ObjectId per the schema, so
 * **not one matches** -> the per-block trade detail was empty with "no price data for the traded symbols".
 *
 * The writing side is fixed in trade-upsert.ts. This script restores the documents already stored.
 *
 *   node scripts/fix-trade-portfolioid-type.mjs           # only shows what would change
 *   node scripts/fix-trade-portfolioid-type.mjs --apply   # actually fixes
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/handmade-site';

await mongoose.connect(URI);
const col = mongoose.connection.db.collection('stocktrades');

const before = await col.aggregate([
  { $match: { portfolioId: { $exists: true, $ne: null } } },
  { $group: { _id: { $type: '$portfolioId' }, n: { $sum: 1 } } },
]).toArray();
console.log('지금 타입 분포:');
for (const r of before) console.log(`  ${r._id}: ${r.n}건`);

const rows = await col.find({ portfolioId: { $type: 'string' } })
  .project({ portfolioId: 1 }).toArray();
console.log(`\n문자열 ${rows.length}건`);

const ops = [];
let 불량 = 0;
for (const r of rows) {
  if (!mongoose.Types.ObjectId.isValid(r.portfolioId)) {
    console.log(`  ⚠ ObjectId 로 볼 수 없는 값 — 건너뜀: ${JSON.stringify(r.portfolioId)}`);
    불량++;
    continue;
  }
  ops.push({
    updateOne: {
      filter: { _id: r._id },
      update: { $set: { portfolioId: new mongoose.Types.ObjectId(r.portfolioId) } },
    },
  });
}
console.log(`  → 고칠 것 ${ops.length}건${불량 ? ` · 건너뜀 ${불량}건` : ''}`);

if (!APPLY) {
  console.log('\n미리보기입니다. 실제로 고치려면 --apply 를 붙이세요.');
} else if (ops.length) {
  const res = await col.bulkWrite(ops, { ordered: false });
  console.log(`\n적용 완료 — ${res.modifiedCount}건 수정`);
  const after = await col.aggregate([
    { $match: { portfolioId: { $exists: true, $ne: null } } },
    { $group: { _id: { $type: '$portfolioId' }, n: { $sum: 1 } } },
  ]).toArray();
  console.log('바뀐 뒤 타입 분포:');
  for (const r of after) console.log(`  ${r._id}: ${r.n}건`);
} else {
  console.log('\n고칠 것이 없습니다.');
}
await mongoose.disconnect();
