#!/usr/bin/env node
// scripts/seed-367-voices.mjs - loading #73/#87's treatments and prose-style variants.
//
// Why this seed is needed
//   The treatment (an event skeleton, the canonical text for writing) and the variants (the per-style bodies) lived **only in the DB**.
//   The work was done with gitignored one-off scripts and not a line survived in the seeds. So
//   a rebuild through seeds-replay.sh lost 72,458 characters whole (135 treatments, 135 Tolkien, 1 echo).
//   There was a hole in the disaster-recovery path.
//
//   The data lives in scripts/seed-voices-data.json (192KB - too large to inline in the seed file).
//   To update it, dump from the DB again and replace that JSON.
//
// Idempotent: it $sets the same values, so a second run leaves the state unchanged.
//   updatedAt is **left alone** - updating that too would make seed-idempotency report "changed"
//   (that is this repository's rule).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(resolve(HERE, 'seed-voices-data.json'), 'utf8'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');

  let touched = 0;
  let missing = 0;
  for (const [id, rec] of Object.entries(DATA)) {
    const set = {};
    if (rec.treatment) set.treatment = rec.treatment;
    if (rec.variants) {
      // variants are set key by key rather than overwritten wholesale - so a style absent from the seed is not deleted.
      for (const [voice, body] of Object.entries(rec.variants)) set[`variants.${voice}`] = body;
    }
    if (!Object.keys(set).length) continue;
    const r = await col.updateOne({ id }, { $set: set });
    if (!r.matchedCount) {
      console.warn(`  - 씬 없음(건너뜀): ${id}`);
      missing++;
      continue;
    }
    if (r.modifiedCount) touched++;
  }

  console.log(`seed-367-voices: 대상 ${Object.keys(DATA).length}개 / 변경 ${touched}개${missing ? ` / 없음 ${missing}개` : ''}`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-367-voices 실패:', e.message);
  process.exit(1);
});
