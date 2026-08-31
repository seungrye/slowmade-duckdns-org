/**
 * strategyHistory(#83) 를 설정 리비전(#350)으로 옮긴다.
 *
 * 리비전이 strategyHistory 의 상위집합이라 필드를 걷어냈다. 이미 쌓인 줄은 버리지 않고
 * 옮긴다 — #348 복구 때 "언제 전략을 갈아탔는지" 가 실제로 단서가 됐다.
 *
 * ⚠ **당시 config 는 어디에도 없다.** strategyHistory 는 전략 이름과 시각만 남겼다. 그래서
 *   스냅샷에 전략만 넣고, 나머지가 없다는 사실을 _note 로 명시한다. 지어내지 않는다.
 *
 * 리비전이 이미 있는 블록은 **건너뛴다** — 옮긴 줄이 뒤 version 을 받으면 시간 순서가
 * 뒤집혀 이력이 거짓말을 한다. 설정을 바꾸기 전에 한 번 돌리는 것을 전제로 한다.
 *
 * 그리고 살아 있는 블록마다 **지금 값을 기준선으로 한 줄** 남긴다. 리비전은 변경 "후" 값을
 * 담으므로, 기준선이 없으면 이 기능 이전부터 있던 블록은 첫 변경 때 예전 값이 사라진다.
 * 두 단계 모두 여러 번 돌려도 안전하다(이미 있으면 건너뛴다).
 *
 *   node scripts/migrate-strategy-history-to-revisions.mjs           # 보여만 준다
 *   node scripts/migrate-strategy-history-to-revisions.mjs --apply   # 옮기고 필드를 지운다
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
 * ── 기준선 ──────────────────────────────────────────────────────────────
 *
 * 리비전은 **변경 "후"** 값을 담는다. 그래서 이 기능이 생기기 전부터 있던 블록은
 * **첫 변경 때 예전 값이 그대로 사라진다** — #348 과 똑같은 사고가 한 번 더 가능하다.
 *
 * 그래서 지금 값을 기준선으로 한 줄 남긴다. 위에서 옮긴 줄들은 전략 이름뿐이라
 * (당시 config 가 기록되지 않았다) 기준선 노릇을 못 한다 — config 가 든 스냅샷이
 * 하나도 없는 블록만 대상으로 한다.
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
