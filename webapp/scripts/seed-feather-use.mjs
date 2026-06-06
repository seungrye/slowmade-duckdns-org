#!/usr/bin/env node
// scripts/seed-feather-use.mjs — #322 인벤 활용 — spirit_beast_feather hasItem 분기.
//
// solwen_grief 에서 획득 → 그러나 어디서도 *사용* 안 함 (hasItem 조건 0).
// 시스템적으로 *데코레이션 인벤* 상태.
//
// 변경: climax_sylvan_path 에 hasItem(spirit_beast_feather) hidden 분기 추가.
//   *깃털을 손바닥에 쥐고 — 세계수의 완전한 노래를 부른다*.
//   stigmaDelta -5 (영수의 가호로 침식 진정).

import mongoose from 'mongoose';

const BRANCH = {
  sceneId: 'climax_sylvan_path',
  choice: {
    kind: 'conditional',
    id: 'feather_song',
    label: '[영수의 깃털] 손바닥에 쥐고 — *세계수의 완전한 노래* 를 부른다.',
    condition: { kind: 'hasItem', itemId: 'spirit_beast_feather' },
    to: 'ending_sylvan_bond',
    hidden: true,
    stigmaDelta: -5, // 영수의 가호
  },
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const cur = await Scene.findOne({ id: BRANCH.sceneId }).lean();
  if (!cur) { console.log('없음'); process.exit(1); }
  const choices = [...(cur.choices ?? [])];
  if (choices.find((c) => c.id === BRANCH.choice.id)) {
    console.log('skip'); process.exit(0);
  }
  choices.push(BRANCH.choice);
  if (choices.length > 3) {
    console.error('한도 초과'); process.exit(1);
  }
  await Scene.findOneAndUpdate({ id: BRANCH.sceneId }, { choices });
  console.log('updated:', BRANCH.sceneId, `(${choices.length} 분기)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
