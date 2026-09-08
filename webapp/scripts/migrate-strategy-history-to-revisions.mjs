/**
 * Moves strategyHistory (#83) into the settings revisions (#350).
 *
 * Revisions are a superset of strategyHistory, so the field was removed. The rows already accumulated are moved
 * rather than discarded - during #348's recovery, "when did the strategy change" was a real clue.
 *
 * Note: **the config of the time exists nowhere.** strategyHistory kept only the strategy's name and the time. So
 *   the snapshot carries the strategy alone and states in _note that the rest is absent. Nothing is invented.
 *
 * A block that already has revisions is **skipped** - a moved row taking a later version would invert the
 * chronology and make the history lie. It assumes one run before any settings change.
 *
 * It also leaves **one row as a baseline of the current values** on every live block. A revision holds the value "after"
 * a change, so without a baseline a block older than this feature loses its previous values at the first change.
 * Both steps are safe to run repeatedly (an existing one is skipped).
 *
 *   node scripts/migrate-strategy-history-to-revisions.mjs           # only shows
 *   node scripts/migrate-strategy-history-to-revisions.mjs --apply   # moves and removes the field
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/handmade-site';

await mongoose.connect(URI);
const db = mongoose.connection.db;
const pfs = db.collection('tradingportfolios');
const revs = db.collection('tradingportfoliorevisions');

const rows = await pfs.find({ strategyHistory: { $exists: true, $ne: [] } }).toArray();
console.log(`strategyHistory 가 있는 블록 ${rows.length}개`);

let moved = 0, skipped = 0;
for (const p of rows) {
  const already = await revs.countDocuments({ portfolioId: p._id });
  if (already > 0) {
    console.log(`  ${p.market}/${p.strategy} — 리비전이 이미 ${already}개라 건너뛴다`);
    skipped++;
    continue;
  }
  const hist = [...p.strategyHistory].sort((a, b) => a.changedAt - b.changedAt);
  console.log(`  ${p.market}/${p.strategy} — ${hist.length}줄 옮김`);
  for (const [i, h] of hist.entries()) {
    console.log(`      v${i + 1}  ${new Date(h.changedAt).toISOString().slice(0, 10)}  ${h.strategy}`);
    if (!APPLY) continue;
    await revs.insertOne({
      portfolioId: p._id, accountId: p.accountId,
      version: i + 1,
      action: i === 0 ? 'create' : 'update',
      snapshot: {
        strategy: h.strategy,
        _note: '전략 이름만 남아 있다 — strategyHistory(#83)에서 옮긴 줄이라 이 시점 config·runAt 은 기록되지 않았다',
      },
      changed: i === 0 ? [] : ['strategy'],
      createdAt: new Date(h.changedAt),
    });
  }
  moved++;
}

/**
 * -- the baseline --------------------------------------------------------
 *
 * A revision holds the value **"after"** a change. So a block that predates this feature
 * **loses its previous values at the very first change** - the same accident as #348 could happen again.
 *
 * So one row is left as a baseline of the current values. The rows moved above carry the strategy name alone
 * (the config of the time was never recorded) and cannot serve as a baseline - only blocks with
 * no config-bearing snapshot at all are covered.
 */
const SETTING_KEYS = ['market', 'strategy', 'runAt', 'weekdaysOnly', 'enabled', 'reservedCash', 'config'];
const live = await pfs.find({ isDeleted: { $ne: true } }).toArray();
let seeded = 0;
console.log(`\n기준선 — 살아 있는 블록 ${live.length}개`);
for (const p of live) {
  const full = await revs.countDocuments({ portfolioId: p._id, 'snapshot.config': { $exists: true } });
  if (full > 0) { console.log(`  ${p.market}/${p.strategy} — 값이 든 리비전이 이미 있다`); continue; }
  const last = await revs.find({ portfolioId: p._id }).sort({ version: -1 }).limit(1).toArray();
  const version = (last[0]?.version ?? 0) + 1;
  const snapshot = {
    market: p.market ?? '', strategy: p.strategy ?? '', runAt: p.runAt ?? '',
    weekdaysOnly: p.weekdaysOnly !== false, enabled: p.enabled !== false,
    reservedCash: Number(p.reservedCash ?? 0) || 0, config: p.config ?? {},
    _note: '이 기능을 켠 시점의 값 — 그 이전 변경은 값이 기록되지 않았다',
  };
  console.log(`  ${p.market}/${p.strategy} — v${version} 기준선  ${JSON.stringify(p.config)}`);
  if (APPLY) {
    await revs.insertOne({
      portfolioId: p._id, accountId: p.accountId, version,
      action: 'update', snapshot, changed: [], createdAt: new Date(),
    });
  }
  seeded++;
}

if (!APPLY) {
  console.log('\n미리보기다. 실제로 옮기려면 --apply');
} else {
  const r = await pfs.updateMany({}, { $unset: { strategyHistory: '' } });
  console.log(`\n옮긴 블록 ${moved}개, 건너뛴 블록 ${skipped}개, 기준선 ${seeded}개.`);
  console.log(`strategyHistory 필드 제거: ${r.modifiedCount}개 문서`);
}
await mongoose.disconnect();
