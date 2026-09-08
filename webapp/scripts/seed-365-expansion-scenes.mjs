#!/usr/bin/env node
// scripts/seed-365-expansion-scenes.mjs - loading the scene expansion (filling the disaster-recovery hole).
//
// Why it is needed
//   Rebuilding an empty mongo with seeds-replay.sh produced only 125 scenes. Production has 135.
//   The 10 missing were made later by "the scene expansion reflecting the author's notes", and not a line of that work
//   survived in the seeds. **The parent scenes' choices** pointing at them were missing too.
//
//   The rebuild does not look broken (0 broken links). It is self-consistent as the state before the expansion.
//   That made it more dangerous - even after a recovery it is hard to notice what disappeared.
//
// What goes in
//   - the 10 expansion scenes: 4 harmony branches per stigma (lunar/selene/hecate/none), 2 Kael recollections
//     (kael_gate_recall, kael_marik_truth), 2 Solwen bonds (bond_accept, bond_echo),
//     2 tale expansions (tale_knight_past, tale_serum_ward)
//   - the 6 parents' choices that open the way to them
//
//   The data is in scripts/seed-expansion-data.json. treatment and variants are not included -
//   those belong to seed-367-voices, so **this seed must run first** and create the scenes.
//
// Idempotent: the scenes are $set upserts, and mongo does not count an identical choice as a change.
//   updatedAt is left alone (the seed-idempotency rule).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const HERE = dirname(fileURLToPath(import.meta.url));
const { scenes, choices } = JSON.parse(readFileSync(resolve(HERE, 'seed-expansion-data.json'), 'utf8'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');

  let created = 0;
  let updated = 0;
  for (const scene of scenes) {
    const r = await col.updateOne({ id: scene.id }, { $set: scene }, { upsert: true });
    if (r.upsertedCount) created++;
    else if (r.modifiedCount) updated++;
  }

  let wired = 0;
  for (const [id, list] of Object.entries(choices)) {
    const r = await col.updateOne({ id }, { $set: { choices: list } });
    if (!r.matchedCount) { console.warn(`  - 부모 씬 없음: ${id}`); continue; }
    if (r.modifiedCount) wired++;
  }

  console.log(`seed-365-expansion-scenes: 씬 생성 ${created} / 갱신 ${updated} / 부모 선택지 ${wired}`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-365-expansion-scenes 실패:', e.message);
  process.exit(1);
});
