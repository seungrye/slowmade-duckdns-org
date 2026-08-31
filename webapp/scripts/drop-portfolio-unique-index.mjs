/**
 * 포트폴리오의 (accountId, market) 유니크 인덱스를 지운다 (#339).
 *
 * 계정·시장당 여러 블록을 두려면 이 인덱스가 없어야 한다. mongoose 는 스키마에서 인덱스를
 * 빼도 **이미 만들어진 DB 인덱스를 지우지 않으므로**, 안 지우면 두 번째 블록을 만들 때
 * duplicate key 로 실패한다.
 *
 *   node scripts/drop-portfolio-unique-index.mjs           # 지금 인덱스를 보여만 준다
 *   node scripts/drop-portfolio-unique-index.mjs --apply   # 실제로 지운다
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
  // 조회용 인덱스는 남긴다. 다음 앱 기동 때 mongoose 가 다시 만들지만, 여기서 바로 만들어
  // 두면 지운 직후의 조회도 느려지지 않는다.
  await col.createIndex({ accountId: 1, market: 1 });
  console.log(`\n${NAME} (UNIQUE) 를 지우고 조회용으로 다시 만들었다.`);
}

await mongoose.disconnect();
