#!/usr/bin/env node
// scripts/recover-user-shopkeeper.mjs — 일회성 데이터 복구 (#252).
//
// 사용자(seungrye@gmail.com) 의 shopkeeper 엔딩 도달이 #252 진앙 (unique key
// 충돌로 end-run 400) 으로 mongo 에 적치 안 됨. 복구:
//   1. past_run 에 (runIndex=2, endingId=shopkeeper) insert.
//   2. save 의 character/currentSceneId unset + runIndex=3.
//
// 실행 후 갤러리에서 shopkeeper 표시 + 다음 모험은 creating 부터.

import mongoose from 'mongoose';

const USER_EMAIL = 'seungrye@gmail.com';

const PastRunSchema = new mongoose.Schema({}, { strict: false, collection: 'webadventurepastruns' });
const SaveSchema = new mongoose.Schema({}, { strict: false, collection: 'webadventuresaves' });

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const PastRun = mongoose.model('PR', PastRunSchema);
  const Save = mongoose.model('SV', SaveSchema);

  const save = await Save.findOne({ userEmail: USER_EMAIL }).lean();
  if (!save) {
    console.log('save 없음');
    process.exit(1);
  }
  console.log('현재 save:', { runIndex: save.runIndex, scene: save.currentSceneId, hasChar: !!save.character });

  // 가장 큰 runIndex 다음 슬롯 — 일반적으로 save.runIndex+1.
  const existingRuns = await PastRun.find({ userEmail: USER_EMAIL }).lean();
  const maxRunIndex = existingRuns.reduce((m, r) => Math.max(m, r.runIndex), 0);
  const targetRunIndex = Math.max(save.runIndex, maxRunIndex) + 1;
  console.log('이미 적치:', existingRuns.map((r) => `run${r.runIndex}:${r.endingId}`).join(', '));
  console.log('새 past_run runIndex:', targetRunIndex);

  // past_run insert (upsert by safety).
  const upRes = await PastRun.findOneAndUpdate(
    { userEmail: USER_EMAIL, runIndex: targetRunIndex },
    {
      userEmail: USER_EMAIL,
      runIndex: targetRunIndex,
      endingId: 'shopkeeper',
      finalSceneId: 'ending_shopkeeper',
      character: save.character,
      completedAt: new Date(),
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  console.log('past_run upsert:', upRes._id, upRes.endingId);

  // save 갱신.
  const newRunIndex = targetRunIndex + 1;
  await Save.findOneAndUpdate(
    { userEmail: USER_EMAIL },
    { runIndex: newRunIndex, $unset: { character: '', currentSceneId: '' } },
    { new: true },
  );
  console.log('save 갱신: runIndex =', newRunIndex, ', character/currentSceneId unset');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('예외', err);
  process.exit(2);
});
