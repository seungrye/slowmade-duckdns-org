/**
 * stocktrades.portfolioId 가 **문자열로 저장된** 것을 ObjectId 로 되돌린다 (#384).
 *
 * `upsertTrades` 는 `StockTrade.collection.bulkWrite`(원시 드라이버)를 쓴다 — 거기엔
 * mongoose 캐스팅이 없어서, 귀속(#372)이 넘긴 `String(_id)` 가 문자열 그대로 저장됐다.
 * 반면 조회(`StockTrade.find({ portfolioId })`)는 스키마대로 ObjectId 로 캐스팅되므로
 * **한 건도 안 맞는다** → 블록별 매매 상세가 "매매 종목 주가 데이터가 없습니다" 로 비었다.
 *
 * 쓰는 쪽은 trade-upsert.ts 에서 고쳤다. 이 스크립트는 이미 들어간 문서를 되돌린다.
 *
 *   node scripts/fix-trade-portfolioid-type.mjs           # 무엇이 바뀔지 보여만 준다
 *   node scripts/fix-trade-portfolioid-type.mjs --apply   # 실제로 고친다
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
