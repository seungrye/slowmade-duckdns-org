/**
 * Reverts the US block from value_rebalancing to infinite_v4 (the same kind of recovery as #77).
 *
 * Switching the US (TQQQ) block to VR on 2026-08-31 overwrote the config entirely. The old config survives
 * nowhere (no backup, no mongo oplog), so it was **reconstructed from the trade records**.
 *
 * -- How it was reconstructed -------------------------------------------
 *
 * v4 decides every order quantity with floor(), so one observed quantity gives a **range** for a parameter.
 * Overlaying 15 trading days (08-10 to 08-28) of order logs (tradingorderlogs) and fills (stocktrades) solved it.
 *
 *   symbol      TQQQ            state.v4.symbol and every order log
 *   splits      20              one = cycleCash/(splits-T) matches the stored state
 *                               (49785.81/10.7158 = 4646.04 = state.pending.one)
 *   sellTarget  15              08-13's average 74.03 x 1.15 = 85.13 = the actual take-profit price (matching to the cent)
 *   starBase    15              08-11's average 74.11, the star point 84.12, T=1.00
 *                               (base - 2*base*T/splits)/100 = 0.1350 -> base = 15.00
 *   runAt       09:35 ET        every one of the 15 days' v4 orders went out at 09:35 ET
 *   syncUniverseRef none        after 08-10, only TQQQ accumulated in stockdailyprices.
 *                               Had a universe been set, sp500-us symbols would have accumulated too.
 *
 *   principal   narrows only to 93,232.37 ~ 93,374.44 (a $142 span, 0.15%).
 *               The 15 days' constraints all overlap without contradiction, so the range itself is trustworthy, but
 *               **it cannot be pinned to a point.** The rounded midpoint 93,300 is used.
 *
 *               Note: this error has no effect at present. infinite-v4-engine.loadState, when state.v4 exists,
 *               carries cycleCash and T straight over and discards principal (line 206). principal is used only as
 *               **cycleCash's starting value when there is no state**. Should the state ever be cleared and restarted,
 *               the real principal will be set then.
 *
 * state.v4 is not cleared by a strategy change and survives as it was (T=9.28, cycleCash=49,785.81,
 * lastRunDate=20260827). It is left alone - it is the original if the cycle is to carry on.
 *
 *   node scripts/restore-us-infinite-v4.mjs           # only shows what would change
 *   node scripts/restore-us-infinite-v4.mjs --apply   # actually reverts
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
  // #83 - the fact of the strategy switch is recorded. This recovery is a line of that history too.
  $push: { strategyHistory: { strategy: 'infinite_v4', changedAt: new Date() } },
});
const after = await col.findOne({ _id: pf._id });
console.log('\n되돌렸다.');
console.log(`  strategy=${after.strategy} runAt=${after.runAt} config=${JSON.stringify(after.config)}`);
console.log(`  이력=${JSON.stringify(after.strategyHistory)}`);
await mongoose.disconnect();
