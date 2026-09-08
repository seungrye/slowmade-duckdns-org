#!/usr/bin/env node
// scripts/seed-falling-lunar.mjs - #323's hidden lunar-ability branch in kael_falling.
//
// kael_falling's branch 1 of 3 (the rise_to_ground con probability).
// The lunar stigma - *a safe landing* through magitech navigation data. Only hpDelta -1.

import mongoose from 'mongoose';

const BRANCH = {
  sceneId: 'kael_falling',
  choice: {
    kind: 'conditional',
    id: 'lunar_navigation',
    label: '[루나] 마법공학 항법 데이터로 — *안전 착륙 좌표* 를 계산한다.',
    condition: { kind: 'ability', required: 'lunar' },
    to: 'omphalos_outskirts',
    hidden: true,
    stigmaDelta: 1, // 마법 소모
  },
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const cur = await Scene.findOne({ id: BRANCH.sceneId }).lean();
  if (!cur) process.exit(1);
  const choices = [...(cur.choices ?? [])];
  if (choices.find((c) => c.id === BRANCH.choice.id)) { console.log('skip'); process.exit(0); }
  choices.push(BRANCH.choice);
  if (choices.length > 3) process.exit(1);
  await Scene.findOneAndUpdate({ id: BRANCH.sceneId }, { choices });
  console.log('updated:', BRANCH.sceneId, `(${choices.length} 분기)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
