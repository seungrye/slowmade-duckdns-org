#!/usr/bin/env node
// scripts/seed-368-stigma-gates.mjs - #99's contamination gates.
//
// In two places the narration and the conditions disagreed.
//
// 1) Ascension - climax_ascension_path says "your contaminated body will be the last step of the fuel's recovery"
//    and the ending calls you "the rite's final qualifier". Yet the choice that leads there
//    (station_knowledge_branch's priesthood bargain) had no condition, so Solwen at contamination 0 could ascend
//    just the same. With no contamination to burn as fuel.
//      -> stigmaAtLeast 40. Set lower than the awakening's 70. Awakening is "holding it by your own strength", while
//        ascension is "being offered as material", so a lower threshold fits the story.
//
// 2) Unmarked - climax_harmony_path's unmarked option says "anyone bearing a stigma turns to stone on the spot,
//    so go with unmarked bare skin" while its only condition was ability=none. The stigma's ability and
//    the contamination are separate axes, so Kael at contamination 80 with the unmarked ability became
//    "unmarked bare skin" with crystals sprouting from his arm.
//      → ability=none AND stigmaAtMost 20.
//
// The dead-end check: failing the conditions still leaves the rite's attunement and the reconsider option in station_knowledge_branch,
//   and a probability choice in climax_harmony_path.
//
// Idempotent: writing the same condition again is not counted as a change by mongo when the value matches.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

/** The minimum contamination ascension needs - it must have progressed enough to serve as fuel. */
const ASCENSION_MIN_STIGMA = 40;
/** The ceiling that still passes as "unmarked bare skin". */
const UNMARKED_MAX_STIGMA = 20;

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');
  let changed = 0;

  // 1) the priesthood bargain - a contamination floor on entering ascension.
  const know = await col.findOne({ id: 'station_knowledge_branch' });
  if (know) {
    const choices = (know.choices || []).map((c) => {
      if (c.to !== 'climax_ascension_path') return c;
      return { ...c, kind: 'conditional', hidden: true, condition: { kind: 'stigmaAtLeast', min: ASCENSION_MIN_STIGMA } };
    });
    const r = await col.updateOne({ id: 'station_knowledge_branch' }, { $set: { choices } });
    if (r.modifiedCount) changed++;
  } else console.warn('  - 씬 없음: station_knowledge_branch');

  // 2) unmarked - the ability and the contamination are read together.
  const harmony = await col.findOne({ id: 'climax_harmony_path' });
  if (harmony) {
    const choices = (harmony.choices || []).map((c) => {
      const isNone = c.condition?.kind === 'ability' && c.condition?.required === 'none';
      if (!isNone) return c;
      return {
        ...c,
        condition: {
          kind: 'all',
          conditions: [
            { kind: 'ability', required: 'none' },
            { kind: 'stigmaAtMost', max: UNMARKED_MAX_STIGMA },
          ],
        },
      };
    });
    const r = await col.updateOne({ id: 'climax_harmony_path' }, { $set: { choices } });
    if (r.modifiedCount) changed++;
  } else console.warn('  - 씬 없음: climax_harmony_path');

  console.log(`seed-368-stigma-gates: 변경 ${changed}개 씬 (승천 ≥${ASCENSION_MIN_STIGMA} · 무흔 ≤${UNMARKED_MAX_STIGMA})`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-368-stigma-gates 실패:', e.message);
  process.exit(1);
});
