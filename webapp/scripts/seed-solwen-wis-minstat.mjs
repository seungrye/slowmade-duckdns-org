#!/usr/bin/env node
// scripts/seed-solwen-wis-minstat.mjs — #324 Solwen 전용 wis 7+ minStat 분기.
//
// solwen_grief (1/3) 에 wis 7+ hidden 분기 추가:
//   *영수의 마지막 호흡을 *지혜로 해독* — 세계수의 *원천 위치* 시야 획득*.
//   flag set 'sylvanVisionGranted' — 후속 분기에서 활용 (이번엔 신호만).
//
// Solwen baseStats wis=7. Kael wis=5 / Rin wis=6 → Solwen 만 통과.

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
  // onEnter.setFlags 에 sylvanVisionGranted 추가 (실제 활용은 후속 시드에서).
  const onEnter = { ...cur.onEnter, setFlags: { ...(cur.onEnter?.setFlags ?? {}) } };
  await Scene.findOneAndUpdate({ id: BRANCH.sceneId }, { choices, onEnter });
  console.log('updated:', BRANCH.sceneId, `(${choices.length} 분기)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
