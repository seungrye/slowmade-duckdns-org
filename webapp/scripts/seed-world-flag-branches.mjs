#!/usr/bin/env node
// scripts/seed-world-flag-branches.mjs - #272: putting the cross-run boomerang to use.
//
// So a previous run's endingId changes *the branches themselves* in the next run - conditional branches
// checking a world.* flag are added to the real content.
//
// Added:
//   climax_revolution_path
//     existing: join_revolution / reject_revolution
//     added: [the echo of harmony] a song instead of the hammer - hidden behind `world.harmony_kept`
//          -> climax_harmony_path (a second road unlocked by the cross-run boomerang)
//   omphalos_blackmarket
//     existing: to_station_after
//     added: [the ashen informant] the remains of a fallen world - hidden behind `world.world_fell`
//          -> omphalos_station (the informant shares *the memory of the fallen world*, a stigma -3 bonus)

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
    // Checked so the 3-branch limit is not exceeded.
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
