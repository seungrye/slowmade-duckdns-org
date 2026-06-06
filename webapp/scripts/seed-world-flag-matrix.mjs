#!/usr/bin/env node
// scripts/seed-world-flag-matrix.mjs — #276 6 world flag 매트릭스 완성.
//
// 이전 회차의 모든 6 엔딩이 *다음 회차의 어디선가* hidden 분기로 활용된다.
// 매트릭스 (world flag → 활용 위치):
//   world.harmony_kept     → climax_revolution_path / echo_of_harmony   (이미)
//   world.world_fell       → omphalos_blackmarket / ashen_informant     (이미)
//   world.solaris_strong   → climax_ascension_path / blessed_descent    (신규)
//   world.revolution_won   → omphalos_outskirts / iron_lookout          (신규)
//   world.last_one_fell    → climax_harmony_path / crystal_echo         (신규)
//   world.sylvan_awoke     → climax_sylvan_path / forest_recognized     (신규)

import mongoose from 'mongoose';

const matrix = [
  {
    sceneId: 'climax_ascension_path',
    choice: {
      kind: 'conditional',
      id: 'blessed_descent',
      label: '[옛 사제단의 인도] 익숙한 가락의 의식 — 너를 알아본다.',
      condition: { kind: 'flag', key: 'world.solaris_strong' },
      to: 'ending_ascension',
      hidden: true,
      stigmaDelta: -2, // 익숙함 = 부담 감소.
    },
  },
  {
    sceneId: 'omphalos_outskirts',
    choice: {
      kind: 'conditional',
      id: 'iron_lookout',
      label: '[강철의 망루] 아이언가드 잔당이 너에게 손짓한다.',
      condition: { kind: 'flag', key: 'world.revolution_won' },
      to: 'omphalos_station',
      hidden: true,
      stigmaDelta: 0,
    },
  },
  {
    sceneId: 'climax_harmony_path',
    choice: {
      kind: 'conditional',
      id: 'crystal_echo',
      label: '[옛 결정체의 빛] 잠든 자의 흩어진 마력이 발화기를 진정시킨다.',
      condition: { kind: 'flag', key: 'world.last_one_fell' },
      to: 'ending_harmony',
      hidden: true,
      stigmaDelta: -5, // 옛 자신의 빛이 *지금 너* 의 침식을 식힌다.
    },
  },
  {
    sceneId: 'climax_sylvan_path',
    choice: {
      kind: 'conditional',
      id: 'forest_recognized',
      label: '[숲의 알아봄] 영수가 너에게 다가온다 — 이미 한 번 만난 자.',
      condition: { kind: 'flag', key: 'world.sylvan_awoke' },
      to: 'ending_sylvan_bond',
      hidden: true,
      stigmaDelta: -3,
    },
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const u of matrix) {
    const cur = await Scene.findOne({ id: u.sceneId }).lean();
    if (!cur) { console.log('없음:', u.sceneId); continue; }
    const choices = [...(cur.choices ?? [])];
    if (choices.find((c) => c.id === u.choice.id)) { console.log('skip:', u.sceneId); continue; }
    choices.push(u.choice);
    if (choices.length > 3) {
      console.error(`${u.sceneId} ${choices.length} > 3 — 추가 거부`);
      continue;
    }
    await Scene.findOneAndUpdate({ id: u.sceneId }, { choices });
    console.log('updated:', u.sceneId, `→ ${choices.length} 분기 + ${u.choice.id} (${u.choice.condition.key})`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
