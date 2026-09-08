/**
 * Drops the portfolios' (accountId, market) unique index (#339).
 *
 * Several blocks per account and market need this index gone. mongoose **does not drop an index already
 * created in the DB** when it is removed from the schema, so left in place, creating a second block fails
 * with a duplicate key.
 *
 *   node scripts/drop-portfolio-unique-index.mjs           # only shows the current indexes
 *   node scripts/drop-portfolio-unique-index.mjs --apply   # actually drops
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/handmade-site';
const NAME = 'accountId_1_market_1';

await mongoose.connect(URI);
const col = mongoose.connection.db.collection('tradingportfolios');
const before = await col.indexes();

console.log('지금 인덱스:');
for (const i of before) console.log(`  ${i.name} ${JSON.stringify(i.key)}${i.unique ? ' UNIQUE' : ''}`);

const target = before.find((i) => i.name === NAME);
if (!target) {
  console.log(`\n${NAME} 이 없다 — 할 일 없음.`);
} else if (!target.unique) {
  console.log(`\n${NAME} 은 이미 유니크가 아니다 — 할 일 없음.`);
} else if (!APPLY) {
  console.log(`\n${NAME} (UNIQUE) 를 지운다 — 실제로 지우려면 --apply`);
} else {
  await col.dropIndex(NAME);
  // The lookup index is kept. mongoose recreates it at the next app start, but creating it here
  // keeps lookups fast right after the drop.
  await col.createIndex({ accountId: 1, market: 1 });
  console.log(`\n${NAME} (UNIQUE) 를 지우고 조회용으로 다시 만들었다.`);
}

await mongoose.disconnect();
