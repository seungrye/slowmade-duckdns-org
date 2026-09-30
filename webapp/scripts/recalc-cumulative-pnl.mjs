/**
 * 과거 누적손익·누적수량을 전체 원장으로 다시 계산한다 (#500).
 *
 * #500 수정은 **앞으로** 계산되는 값을 고친다. 이미 저장된 값은 틀린 채 남아 화면의 과거
 * 곡선이 그대로다 — 실측으로 USD 는 +$88,623, KRW 는 +90,997원 과대다. 이 스크립트가 그것을
 * 되돌린다.
 *
 * 무엇을 고치나:
 *   ① portfoliohistories.cumulativePnl — 그 날짜까지의 실현손익(전체 원장 기준)
 *   ② stocktrades.cumulativeQty        — 그 행 직후 보유수량(전체 원장 기준)
 *
 * 무엇을 안 고치나:
 *   · runPnl — 그 날 실현은 원장에서 날짜로 다시 낼 수 있지만, 조회가 실패했던 날(#501)은
 *     원장 자체가 비어 복원 불가다. 손대면 "복원된 값" 과 "원래 0 이었던 값" 이 섞인다.
 *     #501 이후엔 모르는 날에 아예 안 적으므로 앞으로는 구분이 된다.
 *   · 덮여 사라진 매매기록(#502) — 원본이 없어 되살릴 수 없다.
 *
 *   node --env-file=.env.local scripts/recalc-cumulative-pnl.mjs           # 차이만 보여준다
 *   node --env-file=.env.local scripts/recalc-cumulative-pnl.mjs --apply   # 실제로 고친다
 */
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

/** close-sync.walkLedger 와 같은 규칙(평균단가·원가미상 제외). 여기는 날짜별 누적도 낸다. */
function walk(rows) {
  const sorted = [...rows].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1)
      : a.time !== b.time ? (a.time < b.time ? -1 : 1)
        : a.side !== b.side ? (a.side < b.side ? -1 : 1)
          : a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);
  const pos = new Map();
  const cumByDate = new Map();   // YYYY-MM-DD → 그 날까지의 누적
  const cumQty = new Map();      // `${ticker}|${time}|${side}` → 직후 보유
  const unknown = [];
  let cum = 0;
  for (const r of sorted) {
    const st = pos.get(r.ticker) ?? [0, 0];
    if (r.side === "buy") {
      st[0] += r.qty;
      st[1] += r.qty * r.price;
    } else {
      const known = Math.min(r.qty, Math.max(0, st[0]));
      if (known > 0) {
        const avg = st[1] / st[0];
        cum += (r.price - avg) * known;
        st[1] = Math.max(0, st[1] - avg * known);
        st[0] = st[0] - known;
      }
      if (known < r.qty) unknown.push(`${r.ticker} ${r.date} ${r.qty - known}주 원가미상`);
    }
    pos.set(r.ticker, st);
    cumQty.set(`${r.ticker}|${r.time}|${r.side}`, st[0]);
    cumByDate.set(r.date, cum);
  }
  return { cumByDate, cumQty, unknown, finalCum: cum };
}

/** 그 날짜 이하의 마지막 누적값(매매 없는 날은 직전 값이 이어진다). */
function cumAsOf(cumByDate, dateStr) {
  let best = 0;
  for (const [d, v] of cumByDate) if (d <= dateStr) best = v;
  return best;
}

const money = (n) => Math.round(n).toLocaleString();

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) { console.error("MONGO_URI 가 없습니다."); process.exit(1); }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const envs = await db.collection("stocktrades").distinct("env");
  let tradeFixes = 0, histFixes = 0, blockCleans = 0;

  for (const env of envs) {
    for (const currency of ["KRW", "USD"]) {
      // hidden 은 표시 설정이라 회계에서 빼지 않는다(close-sync 와 같은 규칙 — 숨기는 순간
      // 누적이 점프하면 안 된다). 통화는 DB 에서 직접 거른다.
      const trades = await db.collection("stocktrades").find({ env, currency }).toArray();
      const rows = trades
        .map((t) => ({
          _id: t._id, ticker: String(t.ticker), date: String(t.date), time: String(t.time),
          side: t.action === "sell" ? "sell" : "buy",
          qty: Number(t.qty ?? 0), price: Number(t.price ?? 0),
          stored: Number(t.cumulativeQty ?? 0),
        }));
      if (!rows.length) continue;

      const { cumByDate, cumQty, unknown, finalCum } = walk(rows);
      console.log(`\n━━━ ${env} / ${currency} — 체결 ${rows.length}건 · 최종 누적 ${money(finalCum)} ━━━`);
      if (unknown.length) {
        console.log(`  ⚠ 원가 미상 ${unknown.length}건(손익 제외): ${unknown.slice(0, 3).join(" · ")}`);
      }

      // ② stocktrades.cumulativeQty
      const qtyOps = [];
      for (const r of rows) {
        const want = cumQty.get(`${r.ticker}|${r.time}|${r.side}`) ?? 0;
        if (want !== r.stored) {
          qtyOps.push({ updateOne: { filter: { _id: r._id }, update: { $set: { cumulativeQty: want } } } });
        }
      }
      console.log(`  누적수량: ${qtyOps.length}/${rows.length}건 불일치`);
      if (qtyOps.length && APPLY) {
        const res = await db.collection("stocktrades").bulkWrite(qtyOps, { ordered: false });
        tradeFixes += res.modifiedCount ?? 0;
      }

      // ① portfoliohistories.cumulativePnl — **계좌 행만** (portfolioId: null).
      //
      // ⚠ 블록 행에 넣으면 안 된다 (#382). 여기서 구한 cum 은 계좌 전체 체결에서 나온
      //   **계좌 단위** 값이라, 블록 행에 그대로 박으면 블록마다 계좌 전체 손익을 제 것이라
      //   주장하게 된다. (이 스크립트 첫 판이 실제로 그렇게 써서 두 블록 행이 똑같이
      //   −2,238 을 들고 있었다. 아래 ③ 이 그걸 걷어낸다.)
      //   블록별 손익은 그 블록에 귀속된 체결로 따로 계산해야 한다 — 별건이다.
      const hist = await db.collection("portfoliohistories")
        .find({ env, currency, hidden: { $ne: true }, backfilled: { $ne: true }, portfolioId: null })
        .sort({ date: 1 }).toArray();
      const histOps = [];
      for (const h of hist) {
        const want = Math.round(cumAsOf(cumByDate, String(h.dateStr)) * 10000) / 10000;
        const have = Number(h.cumulativePnl ?? 0);
        if (Math.abs(want - have) > 0.01) {
          histOps.push({ updateOne: { filter: { _id: h._id }, update: { $set: { cumulativePnl: want } } } });
          if (histOps.length <= 5) {
            console.log(`   ${h.dateStr}: ${money(have)} → ${money(want)} (차 ${money(want - have)})`);
          }
        }
      }
      console.log(`  누적손익(계좌 행): ${histOps.length}/${hist.length}개 수정 필요`);
      if (histOps.length && APPLY) {
        const res = await db.collection("portfoliohistories").bulkWrite(histOps, { ordered: false });
        histFixes += res.modifiedCount ?? 0;
      }

      // ③ 블록 행에서 손익 필드를 **걷어낸다** (#382). 0 으로 되돌리지 않고 지운다 —
      //    0 은 "손익이 0 이었다" 는 거짓말이고, 없는 것이 "모른다" 는 사실이다.
      const blockDirty = await db.collection("portfoliohistories")
        .countDocuments({ env, currency, portfolioId: { $ne: null },
                          $or: [{ cumulativePnl: { $exists: true } }, { runPnl: { $exists: true } }] });
      console.log(`  블록 행 손익 필드 제거 대상: ${blockDirty}개`);
      if (blockDirty && APPLY) {
        const res = await db.collection("portfoliohistories").updateMany(
          { env, currency, portfolioId: { $ne: null } },
          { $unset: { cumulativePnl: "", runPnl: "" } });
        blockCleans += res.modifiedCount ?? 0;
      }
    }
  }

  console.log(APPLY
    ? `\n✓ 적용: 매매기록 ${tradeFixes}건 · 계좌 스냅샷 ${histFixes}건 · 블록 손익필드 제거 ${blockCleans}개`
    : "\n--apply 를 주면 실제로 고칩니다.");
  await mongoose.disconnect();
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
