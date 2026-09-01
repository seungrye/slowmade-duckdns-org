/**
 * 미국 계좌에 VR(밸류리밸런싱) 블록을 하나 더 둔다.
 *
 * ── 왜 SOXL 인가 ────────────────────────────────────────────────────────
 *
 * VR 엔진은 브로커의 **실제 보유수량**을 읽는다(`snapshot(sym).holding`). 그런데 TQQQ 는
 * 이미 infinite_v4 블록이 굴리고 있어서, VR 을 TQQQ 로 만들면 **v4 가 산 주식을 자기
 * 것으로 착각**한다. 그래서 다른 종목이어야 한다. SOXL 은 문서가 TQQQ 와 함께 드는
 * 레버리지 ETF 다.
 *
 * ── 왜 예약금을 둘 다 적어야 하나 ────────────────────────────────────────
 *
 * 예약(#339)은 **만든 순서대로** 채우고, 금액을 안 적은 블록이 **잔여 전액**을 가져간다.
 * v4 가 먼저(2026-07-17) 만들어졌고 예약금이 비어 있어서, 그대로면 v4 가 계좌 현금을 전부
 * 가져가고 VR 몫이 0 이 된다. 그래서 v4 에도 금액을 적는다.
 *
 * ── 금액 ────────────────────────────────────────────────────────────────
 *
 * 실측(2026-08-31): 미국 계좌 총 $92,580 = 현금 $50,855 + 주식 $41,725.
 * v4 는 사이클 진행 중(T=7.98/20, 장부 $55,978, 1회 매수 $4,656)이라 남은 회차에 쓸 돈이
 * 이미 계좌 현금보다 크다. VR 을 크게 잡으면 v4 사이클이 눈에 띄게 짧아진다.
 *
 *   VR $8,000  — 1회차에 85%($6,800)를 SOXL 로 사고 나머지가 Pool.
 *   v4 $42,000 — 남은 현금. 회차 두 개쯤(≈$9k) 줄어드는 셈이다.
 *
 * 모의계좌라 이 정도 간섭은 감수한다. 실계좌라면 v4 사이클이 끝난 뒤에 넣는 편이 낫다.
 *
 *   node scripts/add-vr-block.mjs           # 무엇이 바뀌는지 보여만 준다
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
// 리비전 이력(#350)에도 남긴다. 설정 API 를 안 거치고 DB 를 직접 고치면 이력이 비어
// 나중에 "언제 왜 바뀌었나" 를 또 역산해야 한다 — #348 이 그래서 생긴 일이다.
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
