#!/usr/bin/env node
// scripts/seed-366-body-snapshot.mjs - fixing the scene bodies as the canonical text.
//
// Why a snapshot
//   Rebuilding an empty mongo with seeds-replay and comparing it against production showed **23 scenes whose bodies
//   differed.** Some had the same number of lines but different content. It is long-accumulated drift - the result of fixing production
//   alone through CMS edits and one-off scripts, with no trace of that history in the seeds.
//
//   Retracing the incremental patches one by one is practically impossible, and even if they matched they would diverge
//   again at the next edit. A seed exists for "recoverability", not "historical reproduction", so the current production is
//   taken as canonical and fixed once, at the end.
//
// So this seed **overwrites the bodies the earlier patches made with the final state.** That does not make the earlier
// seeds pointless - the scene skeletons, choices and flags still come from them.
//
// Note: editing the content means updating this snapshot too. Forget, and a rebuild returns to the old bodies.
//   To update: dump the bodies from mongo and replace scripts/seed-body-data.json.
//
// Idempotent: it $sets the same values, so a second run changes nothing. updatedAt is left alone.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(resolve(HERE, 'seed-body-data.json'), 'utf8'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');
  let changed = 0;
  let missing = 0;
  for (const [id, body] of Object.entries(DATA)) {
    const r = await col.updateOne({ id }, { $set: { body } });
    if (!r.matchedCount) { missing++; continue; }
    if (r.modifiedCount) changed++;
  }
  console.log(`seed-366-body-snapshot: 대상 ${Object.keys(DATA).length}개 / 변경 ${changed}${missing ? ` / 없음 ${missing}` : ''}`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-366-body-snapshot 실패:', e.message);
  process.exit(1);
});
