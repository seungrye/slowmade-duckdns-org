#!/usr/bin/env node
// #325 selene 분기 — solwen_combat_hard 에 hidden 분기.
//   *완력으로 가솔린 통을 *직접* 부수기*. condition.ability=selene.

import mongoose from 'mongoose';

const BRANCH = {
  sceneId: 'solwen_combat_hard',
  choice: {
    kind: 'conditional',
    id: 'selene_strike',
    label: '[셀레네] 가솔린 통을 — *완력으로 직접 부순다*.',
    condition: { kind: 'ability', required: 'selene' },
    to: 'solwen_grief',
    hidden: true,
    stigmaDelta: 3,
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
  await Scene.findOneAndUpdate({ id: BRANCH.sceneId }, { choices });
  console.log('updated:', BRANCH.sceneId, `(${choices.length} 분기)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
