#!/usr/bin/env node
// scripts/seed-act1-boomerang.mjs — #283 회차 부메랑 — act1 우회 분기.
//
// 디자인:
//   이전 회차의 결과가 *다음 회차의 act1 진행* 도 *살짝 다르게* 만든다. 본 분기로
//   이어지는 *짧은 우회 가지* 형태로 — 본 시퀀스를 부수지 않고 *추가 한 줄*.
//
// 매트릭스:
//   kael_corridor    + world.last_one_fell  → kael_corridor_clear (forge_id 성공과 동등) + 침식 -2
//   rin_evidence     + world.revolution_won → rin_underground (rin_betrayal 우회) + flag set
//   solwen_combat    + world.sylvan_awoke   → solwen_grief (전투 우회) + 침식 -3

import mongoose from 'mongoose';

const patches = [
  {
    sceneId: 'kael_corridor',
    choice: {
      kind: 'conditional',
      id: 'crystal_path_memory',
      label: '[옛 카엘의 메아리] 푸른 결정체의 빛이 너의 길을 안내한다.',
      condition: { kind: 'flag', key: 'world.last_one_fell' },
      to: 'kael_corridor_clear',
      hidden: true,
      stigmaDelta: -2,
    },
  },
  {
    sceneId: 'rin_evidence',
    choice: {
      kind: 'conditional',
      id: 'iron_underground',
      label: '[아이언가드의 잔당] 본부 보고 없이 — 직접 지하로.',
      condition: { kind: 'flag', key: 'world.revolution_won' },
      to: 'rin_underground',
      hidden: true,
      stigmaDelta: 0,
    },
  },
  {
    sceneId: 'solwen_combat',
    choice: {
      kind: 'conditional',
      id: 'spirit_guidance',
      label: '[영수의 안내] 가솔린 통 위치 — 노래로 너에게 미리 전해진다.',
      condition: { kind: 'flag', key: 'world.sylvan_awoke' },
      to: 'solwen_grief',
      hidden: true,
      stigmaDelta: -3,
    },
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const p of patches) {
    const cur = await Scene.findOne({ id: p.sceneId }).lean();
    if (!cur) { console.log('없음:', p.sceneId); continue; }
    const choices = [...(cur.choices ?? [])];
    if (choices.find((c) => c.id === p.choice.id)) { console.log('skip:', p.sceneId); continue; }
    choices.push(p.choice);
    if (choices.length > 3) {
      console.error(`${p.sceneId} ${choices.length} > 3 — 추가 거부`);
      continue;
    }
    await Scene.findOneAndUpdate({ id: p.sceneId }, { choices });
    console.log('updated:', p.sceneId, `→ ${choices.length} 분기 + ${p.choice.id} (${p.choice.condition.key})`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
