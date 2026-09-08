/**
 * Drops portfoliohistories' old unique index (#367).
 *
 * Adding per-block snapshots changed the key from (env, currency, date) to (env, currency, portfolioId, date).
 * **mongoose does not drop an index already created in the DB when the schema's index changes** -
 * left in place, an account row and a block row on the same day clash on the old key and the block row is never stored.
 *
 * The new index is created automatically as the app starts. This only drops the old one.
 * (scripts/drop-portfolio-unique-index.mjs did the same thing before.)
 *
 *   node scripts/drop-portfolio-history-index.mjs           # only shows the current indexes
 *   node scripts/drop-portfolio-history-index.mjs --apply   # actually drops
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
