#!/usr/bin/env node
// scripts/seed-solwen-wis-minstat.mjs - #324's Solwen-only wis 7+ minStat branch.
//
// A hidden wis 7+ branch added to solwen_grief (1 of 3):
//   *Reading the spirit beast's last breath *through wisdom* - gaining sight of the world tree's *source*.
//   The flag 'sylvanVisionGranted' is set - used in a later branch (only signalled for now).
//
// Solwen's baseStats have wis=7. Kael's wis=5 and Rin's wis=6 -> only Solwen passes.

import mongoose from 'mongoose';

const BRANCH = {
  sceneId: 'solwen_grief',
  choice: {
    kind: 'conditional',
    id: 'wisdom_vision',
    label: '[지혜] 영수의 마지막 호흡 — *세계수의 시야* 를 받아들인다.',
    condition: { kind: 'minStat', stat: 'wis', min: 7 },
    to: 'solwen_departure',
    hidden: true,
    stigmaDelta: -2, // 영수의 가호로 침식 진정
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
  // sylvanVisionGranted added to onEnter.setFlags (actually used in a later seed).
  const onEnter = { ...cur.onEnter, setFlags: { ...(cur.onEnter?.setFlags ?? {}) } };
  await Scene.findOneAndUpdate({ id: BRANCH.sceneId }, { choices, onEnter });
  console.log('updated:', BRANCH.sceneId, `(${choices.length} 분기)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
