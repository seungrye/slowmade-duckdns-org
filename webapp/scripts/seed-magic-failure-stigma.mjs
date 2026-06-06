#!/usr/bin/env node
// scripts/seed-magic-failure-stigma.mjs — #263 마법 실패 시 추가 침식.
//
// 마법 또는 마력 소모성 선택지의 *실패* 에 stigmaDeltaOnFailure 추가.
// 성공 시는 choice.stigmaDelta 만으로 충분 (현재 +2/+3). 실패 시 *주문 통제 실패
// = 더 큰 신체 부담* 으로 추가 침식.

import mongoose from 'mongoose';

const magicChoicePatches = [
  // 셀레네 마법 (kael_infirmary)
  { sceneId: 'kael_infirmary', choiceId: 'overload_panel', stigmaDeltaOnFailure: 3 },
  // 헤카테 환영 (solwen_grove)
  { sceneId: 'solwen_grove', choiceId: 'frighten_chant', stigmaDeltaOnFailure: 2 },
  // 헤카테 환영 (solwen_combat)
  { sceneId: 'solwen_combat', choiceId: 'shield_spirit', stigmaDeltaOnFailure: 3 },
  // 지능 마법공학 위조 (kael_corridor) — 마법공학 = 약한 마법 소모
  { sceneId: 'kael_corridor', choiceId: 'forge_id', stigmaDeltaOnFailure: 2 },
  // 지능 마법공학 해킹 (station_path_steel)
  { sceneId: 'station_path_steel', choiceId: 'hijack', stigmaDeltaOnFailure: 3 },
  // 지혜 의식 동조 (climax_harmony_path) — 가장 위험한 마법
  { sceneId: 'climax_harmony_path', choiceId: 'still_the_engine', stigmaDeltaOnFailure: 10 },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const patch of magicChoicePatches) {
    const cur = await Scene.findOne({ id: patch.sceneId }).lean();
    if (!cur) {
      console.log('없음:', patch.sceneId);
      continue;
    }
    const choices = cur.choices.map((c) =>
      c.id === patch.choiceId
        ? { ...c, stigmaDeltaOnFailure: patch.stigmaDeltaOnFailure }
        : c,
    );
    await Scene.findOneAndUpdate({ id: patch.sceneId }, { choices });
    console.log('updated:', patch.sceneId, '/', patch.choiceId, `+${patch.stigmaDeltaOnFailure} 실패시`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
