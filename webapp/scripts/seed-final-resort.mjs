#!/usr/bin/env node
// scripts/seed-final-resort.mjs - #327's cleanup of the 4 orphan scenes.
//
// kael_caught / rin_chase / rin_caught - reused as the *second branch* of the detour scenes
// added in #318. *A genuinely final decision* (taking your own life, or surrendering) -> a scenario ending.
//
// ending_petrification - the reducer's isFullyPetrified automatic ending means *the scene is unused*.
//   EndingScreen looks only at endingsMeta. Deleted separately (deleteOne).

import mongoose from 'mongoose';

const REUSE_BRANCHES = [
  // A *suicide branch* added to the kael_struggled detour scene -> kael_caught.
  {
    sceneId: 'kael_struggled',
    choice: {
      kind: 'plain',
      id: 'surrender_petrify',
      label: '[항복] 결정이 자라는 걸 받아들인다. 의식이 멀어지기 전에 — *자발적 정제소 이송*.',
      to: 'kael_caught',
    },
  },
  // A *surrender branch* added to the rin_pursued detour scene -> rin_chase.
  {
    sceneId: 'rin_pursued',
    choice: {
      kind: 'plain',
      id: 'surrender_chase',
      label: '[항복] 휘장을 들어 보이고 — *공식 자수*. 추격은 끝난다.',
      to: 'rin_chase',
    },
  },
  // A *suicide branch* added to the rin_betrayal_aftermath detour scene -> rin_caught.
  {
    sceneId: 'rin_betrayal_aftermath',
    choice: {
      kind: 'plain',
      id: 'surrender_caught',
      label: '[자결] 권총을 *내 가슴에 댄다*. 사제단의 손에 떨어질 바엔.',
      to: 'rin_caught',
    },
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // 1. adding the *plain suicide branch* to the detour scenes.
  for (const r of REUSE_BRANCHES) {
    const cur = await Scene.findOne({ id: r.sceneId }).lean();
    if (!cur) { console.log('없음:', r.sceneId); continue; }
    const choices = [...(cur.choices ?? [])];
    if (choices.find((c) => c.id === r.choice.id)) {
      console.log('skip:', r.sceneId);
      continue;
    }
    choices.push(r.choice);
    if (choices.length > 3) {
      console.error(r.sceneId, choices.length, '> 3'); continue;
    }
    await Scene.findOneAndUpdate({ id: r.sceneId }, { choices });
    console.log('재이용:', r.sceneId, '+', r.choice.id, '→', r.choice.to);
  }

  // 2. deleting ending_petrification - a leftover of the automatic ending.
  const delResult = await Scene.deleteOne({ id: 'ending_petrification' });
  console.log('deleted: ending_petrification ×', delResult.deletedCount);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
