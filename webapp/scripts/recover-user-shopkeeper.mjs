#!/usr/bin/env node
// scripts/recover-user-shopkeeper.mjs - a one-off data recovery (#252).
//
// The user's (seungrye@gmail.com) shopkeeper ending was never stored in mongo because of #252's epicentre (a unique-key
// clash making end-run 400). The recovery:
//   1. insert (runIndex=2, endingId=shopkeeper) into past_run.
//   2. unset the save's character and currentSceneId, and set runIndex=3.
//
// Afterwards the gallery shows shopkeeper and the next adventure starts from creating.

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

  // The slot after the largest runIndex - normally save.runIndex+1.
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

  // Updating the save.
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
