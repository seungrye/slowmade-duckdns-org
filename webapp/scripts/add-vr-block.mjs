/**
 * Adds one more VR (value rebalancing) block to the US account.
 *
 * -- Why SOXL --------------------------------------------------------
 *
 * The VR engine reads the broker's **actual holding** (`snapshot(sym).holding`). But TQQQ is
 * already run by the infinite_v4 block, so making VR use TQQQ would have it **mistake the shares v4
 * bought for its own**. It has to be a different symbol. SOXL is the leveraged ETF the documentation
 * names alongside TQQQ.
 *
 * -- Why both reservations must be written ---------------------------
 *
 * Reservations (#339) fill **in creation order**, and a block with no amount takes **all the remainder**.
 * v4 was created first (2026-07-17) with an empty reservation, so left alone v4 would take every bit of the
 * account's cash and leave VR with 0. Hence an amount is written on v4 too.
 *
 * -- The amounts -----------------------------------------------------
 *
 * Measured (2026-08-31): the US account totals $92,580 = $50,855 cash + $41,725 in shares.
 * v4 is mid-cycle (T=7.98/20, a book of $55,978, $4,656 per buy), so the money it needs for the remaining rounds
 * already exceeds the account's cash. Taking a large VR would visibly shorten v4's cycle.
 *
 *   VR $8,000  - round 1 buys 85% ($6,800) of SOXL and the rest becomes the Pool.
 *   v4 $42,000 - the remaining cash. Roughly two rounds (about $9k) shorter.
 *
 * It is a paper account, so this much interference is accepted. On a live account it would be better to add it
 * after v4's cycle ends.
 *
 *   node scripts/add-vr-block.mjs           # only shows what would change
 *   node scripts/add-vr-block.mjs --apply
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/handmade-site';

const VR_RESERVED = 8_000;
const V4_RESERVED = 42_000;
const VR_CONFIG = {
  symbol: 'SOXL',
  principal: VR_RESERVED,
  gradient: 10,        // 거치식 기본
  bandPct: 0.15,       // ±15% — 문서와 같다
  cycleDays: 10,       // 2주
  initStockRatio: 0.85,
  cashflow: 0,         // 거치식 (모의계좌라 새 입금이 없다)
  feeRate: 0,
  formula: 'skill',    // 실력공식 (#358) — 기본값이지만 명시해 둔다
};

await mongoose.connect(URI);
const col = mongoose.connection.db.collection('tradingportfolios');
const v4 = await col.findOne({ market: 'us', strategy: 'infinite_v4', isDeleted: { $ne: true } });
if (!v4) { console.error('미국 v4 블록을 못 찾았다.'); process.exit(1); }
const 이미 = await col.findOne({ market: 'us', strategy: 'value_rebalancing', isDeleted: { $ne: true } });
if (이미) { console.error('미국 VR 블록이 이미 있다:', String(이미._id)); process.exit(1); }

console.log('지금:');
console.log(`  v4  예약금=${v4.reservedCash || '없음(전액)'}  ${JSON.stringify(v4.config)}`);
console.log('바꾼 뒤:');
console.log(`  v4  예약금=${V4_RESERVED}`);
console.log(`  VR  예약금=${VR_RESERVED}  runAt=15:50 ET  enabled=true`);
console.log(`      ${JSON.stringify(VR_CONFIG)}`);

if (!APPLY) { console.log('\n미리보기다. 실제로 넣으려면 --apply'); await mongoose.disconnect(); process.exit(0); }

const now = new Date();
await col.updateOne({ _id: v4._id }, { $set: { reservedCash: V4_RESERVED } });
const r = await col.insertOne({
  accountId: v4.accountId,
  market: 'us',
  strategy: 'value_rebalancing',
  runAt: '15:50',        // VR 은 종가 근처 권장(LOC 종가 체결). v4(09:35)와 시각도 겹치지 않는다.
  weekdaysOnly: true,
  enabled: true,
  reservedCash: VR_RESERVED,
  config: VR_CONFIG,
  state: {},
  isDeleted: false,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
});
// It is recorded in the revision history (#350) too. Editing the DB directly instead of going through the settings API leaves the history
// empty and forces "when and why did this change" to be reconstructed later - which is exactly how #348 came about.
const revs = mongoose.connection.db.collection('tradingportfoliorevisions');
const 설정만 = (d) => ({
  market: d.market, strategy: d.strategy, runAt: d.runAt,
  weekdaysOnly: d.weekdaysOnly !== false, enabled: d.enabled !== false,
  reservedCash: Number(d.reservedCash ?? 0) || 0, config: d.config ?? {},
});
const 다음버전 = async (pid) => {
  const last = await revs.find({ portfolioId: pid }).sort({ version: -1 }).limit(1).toArray();
  return (last[0]?.version ?? 0) + 1;
};
const v4After = await col.findOne({ _id: v4._id });
await revs.insertOne({
  portfolioId: v4._id, accountId: v4.accountId, version: await 다음버전(v4._id),
  action: 'update', snapshot: 설정만(v4After), changed: ['reservedCash'], createdAt: now,
});
const vrDoc = await col.findOne({ _id: r.insertedId });
await revs.insertOne({
  portfolioId: r.insertedId, accountId: v4.accountId, version: 1,
  action: 'create', snapshot: 설정만(vrDoc), changed: [], createdAt: now,
});

console.log('\n넣었다:', String(r.insertedId));
for (const p of await col.find({ market: 'us', isDeleted: { $ne: true } }).sort({ createdAt: 1 }).toArray()) {
  console.log(`  ${p.strategy.padEnd(18)} 예약금=${p.reservedCash} enabled=${p.enabled} ${JSON.stringify(p.config)}`);
}
await mongoose.disconnect();
