/**
 * portfoliohistories 의 옛 유니크 인덱스를 지운다 (#367).
 *
 * 블록별 스냅샷을 넣으면서 키가 (env, currency, date) → (env, currency, portfolioId, date)
 * 로 바뀌었다. **mongoose 는 스키마에서 인덱스를 바꿔도 이미 만들어진 DB 인덱스를 안 지운다** —
 * 안 지우면 같은 날 계좌 행과 블록 행이 옛 키에서 충돌해 블록 행이 저장되지 않는다.
 *
 * 새 인덱스는 앱이 뜨면서 자동으로 만들어진다. 여기서는 옛것만 지운다.
 * (scripts/drop-portfolio-unique-index.mjs 가 같은 일을 한 선례다.)
 *
 *   node scripts/drop-portfolio-history-index.mjs           # 지금 인덱스를 보여만 준다
 *   node scripts/drop-portfolio-history-index.mjs --apply   # 실제로 지운다
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/handmade-site';
const OLD = 'env_1_currency_1_date_1';

await mongoose.connect(URI);
const col = mongoose.connection.db.collection('portfoliohistories');
const before = await col.indexes();

console.log('지금 인덱스:');
for (const i of before) console.log(`  ${i.name} ${JSON.stringify(i.key)}${i.unique ? ' UNIQUE' : ''}`);

const target = before.find((i) => i.name === OLD);
if (!target) {
  console.log(`\n옛 인덱스(${OLD})가 없다 — 할 일 없음.`);
} else if (!APPLY) {
  console.log(`\n지울 것: ${OLD}. 실제로 지우려면 --apply`);
} else {
  await col.dropIndex(OLD);
  console.log(`\n지웠다: ${OLD}`);
  console.log('남은 인덱스:');
  for (const i of await col.indexes()) console.log(`  ${i.name} ${JSON.stringify(i.key)}${i.unique ? ' UNIQUE' : ''}`);
}
await mongoose.disconnect();
