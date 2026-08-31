/**
 * 미국 블록을 value_rebalancing → infinite_v4 로 되돌린다 (#77 과 같은 종류의 복구).
 *
 * 2026-08-31 에 미국(TQQQ) 블록을 VR 로 바꾸면서 config 가 통째로 덮였다. 예전 config 는
 * 어디에도 안 남아 있어(백업 없음, mongo oplog 없음) **매매기록에서 역산**했다.
 *
 * ── 어떻게 역산했나 ────────────────────────────────────────────────────
 *
 * v4 는 주문 수량을 전부 floor() 로 정하므로, 관측된 수량 하나가 파라미터의 **구간**을 준다.
 * 15 거래일(08-10 ~ 08-28)의 주문로그(tradingorderlogs)와 체결(stocktrades)을 겹쳐 풀었다.
 *
 *   symbol      TQQQ            state.v4.symbol · 전 주문로그
 *   splits      20              one = cycleCash/(splits−T) 가 상태값과 일치
 *                               (49785.81/10.7158 = 4646.04 = state.pending.one)
 *   sellTarget  15              08-13 평단 74.03 × 1.15 = 85.13 = 실제 익절가 (센트까지 일치)
 *   starBase    15              08-11 평단 74.11 · 별지점 84.12,  T=1.00
 *                               (base − 2·base·T/splits)/100 = 0.1350 → base = 15.00
 *   runAt       09:35 ET        v4 주문이 나간 시각 15일 전부 09:35 ET
 *   syncUniverseRef 없음         08-10 이후 stockdailyprices 에 TQQQ 만 쌓였다.
 *                               유니버스가 걸려 있었다면 sp500-us 종목도 같이 쌓였을 것이다.
 *
 *   principal   93,232.37 ~ 93,374.44 로만 좁혀진다(폭 $142, 0.15%).
 *               15일치 제약이 모순 없이 전부 겹쳐 나온 값이라 구간 자체는 믿을 만하지만
 *               **한 점으로는 못 정한다.** 가운데의 반올림 값 93,300 을 쓴다.
 *
 *               ⚠ 이 오차는 지금 아무 영향이 없다. infinite-v4-engine.loadState 는 state.v4 가
 *               있으면 cycleCash·T 를 그대로 이어받고 principal 은 버린다(206행). principal 은
 *               **상태가 없을 때 cycleCash 의 시작값**으로만 쓰인다. 상태를 지우고 새로 시작할
 *               일이 생기면 그때 실제 원금으로 다시 정할 것.
 *
 * state.v4 는 전략을 바꿔도 안 지워져 그대로 남아 있다(T=9.28, cycleCash=49,785.81,
 * lastRunDate=20260827). 손대지 않는다 — 사이클을 이어서 돌리려면 이게 원본이다.
 *
 *   node scripts/restore-us-infinite-v4.mjs           # 무엇이 바뀌는지 보여만 준다
 *   node scripts/restore-us-infinite-v4.mjs --apply   # 실제로 되돌린다
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/handmade-site';

const RESTORED = {
  strategy: 'infinite_v4',
  runAt: '09:35',
  config: { symbol: 'TQQQ', principal: 93300, splits: 20, starBase: 15, sellTarget: 15 },
};

await mongoose.connect(URI);
const col = mongoose.connection.db.collection('tradingportfolios');
const pf = await col.findOne({ market: 'us', isDeleted: { $ne: true } });
if (!pf) { console.error('미국 블록을 못 찾았다.'); process.exit(1); }

console.log('지금:');
console.log(`  strategy=${pf.strategy} runAt=${pf.runAt} enabled=${pf.enabled}`);
console.log(`  config=${JSON.stringify(pf.config)}`);
console.log('되돌린 뒤:');
console.log(`  strategy=${RESTORED.strategy} runAt=${RESTORED.runAt} enabled=${pf.enabled} (enabled 는 안 건드린다)`);
console.log(`  config=${JSON.stringify(RESTORED.config)}`);
console.log(`  state.v4 는 그대로 — T=${pf.state?.v4?.t?.toFixed(2)} cycleCash=${pf.state?.v4?.cycleCash?.toFixed(2)}`);

if (!APPLY) { console.log('\n미리보기다. 실제로 되돌리려면 --apply'); await mongoose.disconnect(); process.exit(0); }

await col.updateOne({ _id: pf._id }, {
  $set: { ...RESTORED },
  // #83 — 전략을 갈아탄 사실 자체를 남긴다. 이번 복구도 이력의 한 줄이다.
  $push: { strategyHistory: { strategy: 'infinite_v4', changedAt: new Date() } },
});
const after = await col.findOne({ _id: pf._id });
console.log('\n되돌렸다.');
console.log(`  strategy=${after.strategy} runAt=${after.runAt} config=${JSON.stringify(after.config)}`);
console.log(`  이력=${JSON.stringify(after.strategyHistory)}`);
await mongoose.disconnect();
