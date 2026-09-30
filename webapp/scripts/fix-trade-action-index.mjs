/**
 * stocktrades 의 멱등키를 (env, ticker, time) → (env, ticker, time, action) 으로 바꾼다 (#502).
 *
 * 왜: close-sync 는 부분체결을 `ticker|time|side` 로 합산해 **매수·매도 레코드를 각각** 만드는데
 * DB 키에는 action 이 없어서 같은 종목·같은 초의 두 건 중 나중 것이 앞 것을 덮었다.
 * 누적손익은 이 원장을 입력으로 계산하므로(#500) 매수 기록이 사라지면 원가가 사라진다.
 *
 * ⚠ mongoose 는 스키마에서 인덱스를 바꿔도 DB 의 옛 인덱스를 지우지 않는다. 그래서 이 스크립트가
 *   필요하다 — 선례: scripts/drop-portfolio-unique-index.mjs · drop-portfolio-history-index.mjs
 *
 *   node --env-file=.env.local scripts/fix-trade-action-index.mjs           # 무엇을 할지만 본다
 *   node --env-file=.env.local scripts/fix-trade-action-index.mjs --apply   # 실제로 바꾼다
 */
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const OLD = "env_1_ticker_1_time_1";
const NEW_KEY = { env: 1, ticker: 1, time: 1, action: 1 };

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI 가 없습니다.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection("stocktrades");

  const before = await col.indexes();
  console.log("현재 인덱스:");
  for (const i of before) console.log(`  ${i.name} ${JSON.stringify(i.key)} unique=${!!i.unique}`);

  const hasOld = before.some((i) => i.name === OLD);
  const hasNew = before.some((i) => JSON.stringify(i.key) === JSON.stringify(NEW_KEY));

  // 새 키로 묶었을 때 충돌이 생기는지 먼저 본다 — 있으면 인덱스를 못 만든다.
  const dup = await col.aggregate([
    { $group: { _id: { env: "$env", ticker: "$ticker", time: "$time", action: "$action" },
                n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 5 },
  ]).toArray();
  if (dup.length) {
    console.log(`\n✗ 새 키 기준 중복 ${dup.length}건(표본) — 먼저 정리해야 unique 인덱스를 만들 수 있다:`);
    for (const d of dup) console.log("   ", JSON.stringify(d));
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log("\n새 키 기준 중복: 0건 ✓");

  console.log(`\n계획: ${hasNew ? "(새 인덱스 이미 있음)" : "새 인덱스 생성"}`
    + ` · ${hasOld ? "옛 인덱스 삭제" : "(옛 인덱스 없음)"}`);
  if (!APPLY) {
    console.log("\n--apply 를 주면 실제로 바꿉니다.");
    await mongoose.disconnect();
    return;
  }

  // 순서가 중요하다 — 새 것을 먼저 만들고 옛 것을 지운다. 중간에 죽어도 유일성이 유지된다.
  if (!hasNew) {
    await col.createIndex(NEW_KEY, { unique: true });
    console.log("✓ 새 unique 인덱스 생성");
  }
  if (hasOld) {
    await col.dropIndex(OLD);
    console.log("✓ 옛 인덱스 삭제");
  }
  console.log("\n최종 인덱스:");
  for (const i of await col.indexes()) console.log(`  ${i.name} ${JSON.stringify(i.key)} unique=${!!i.unique}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
