#!/usr/bin/env node
// scripts/seed-world-flag-branches.mjs — #272 회차 부메랑 활용.
//
// 이전 회차의 endingId 가 다음 회차의 *분기 자체* 를 바꾸도록 — 실 콘텐츠에
// world.* flag 검사 conditional 분기를 추가.
//
// 추가:
//   climax_revolution_path
//     기존: join_revolution / reject_revolution
//     추가: [조화의 메아리] 망치 대신 노래로 — `world.harmony_kept` hidden
//          → climax_harmony_path (회차 부메랑으로 두 번째 길 해금)
//   omphalos_blackmarket
//     기존: to_station_after
//     추가: [잿빛 정보상] 무너진 세계의 잔재 — `world.world_fell` hidden
//          → omphalos_station (정보상이 *추락한 세계의 기억* 공유, stigma -3 보너스)

import mongoose from 'mongoose';

const updates = [
  {
    id: 'climax_revolution_path',
    addChoices: [
      {
        kind: 'conditional',
        id: 'echo_of_harmony',
        label: '[조화의 메아리] 망치 대신 노래로 — 이전 세계가 부른다.',
        condition: { kind: 'flag', key: 'world.harmony_kept' },
        to: 'climax_harmony_path',
        hidden: true,
      },
    ],
  },
  {
    id: 'omphalos_blackmarket',
    addChoices: [
      {
        kind: 'conditional',
        id: 'ashen_informant',
        label: '[잿빛 기억] 추락한 세계의 잔재 — 정보상이 망령처럼 속삭인다.',
        condition: { kind: 'flag', key: 'world.world_fell' },
        to: 'omphalos_station',
        hidden: true,
        stigmaDelta: -3, // 망령의 기억이 *지금의* 침식을 잠시 진정시킨다.
      },
    ],
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const u of updates) {
    const cur = await Scene.findOne({ id: u.id }).lean();
    if (!cur) { console.log('없음:', u.id); continue; }
    const choices = [...(cur.choices ?? [])];
    let added = 0;
    for (const c of u.addChoices) {
      if (choices.find((x) => x.id === c.id)) continue;
      choices.push(c);
      added++;
    }
    if (added === 0) { console.log('skip:', u.id); continue; }
    // 3 분기 초과 방지 검증.
    if (choices.length > 3) {
      console.error(`${u.id}: ${choices.length} > 3 — 추가 거부`);
      continue;
    }
    await Scene.findOneAndUpdate({ id: u.id }, { choices });
    console.log('updated:', u.id, `→ ${choices.length} 분기`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
