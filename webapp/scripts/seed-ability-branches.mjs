#!/usr/bin/env node
// scripts/seed-ability-branches.mjs — #321 4 성흔 차별화 분기.
//
// evalCondition 에 ability kind 추가 (system) — 이번 시드는 *콘텐츠 적용*.
//
// 4 성흔 별 *특수 hidden 분기* — 한 분기당 한 위치 (3 분기 한도 유지).
//   selene (str 보너스, 전투): solwen_combat 에 신규 hidden
//   hecate (cha 보너스, 환영): omphalos_blackmarket — 한도로 추가 어려움 → cameo 활용
//   lunar  (int 보너스, 마법): kael_corridor — 한도로 추가 어려움 → 별도 위치
//   none   (무흔, 재굴림 3): *재굴림으로 평소 위험 분기 시도* — 시스템 의미만,
//                            별도 분기 없음

import mongoose from 'mongoose';

const ABILITY_BRANCHES = [
  // selene = 전투 +2 (str). solwen_combat 에 hidden 분기 *셀레네 마법으로 화염*.
  // 현재 solwen_combat: shoot_canister / shield_spirit / spirit_guidance (3 분기)
  // → 한도 차서 추가 불가. 패스.
  // 대신 station_path_steel (현재 3 분기) — 한도 차.
  // → 신설 위치: kael_caught_minor / kael_struggled / kael_falling_aftermath 같은 *우회 씬* 의 plain
  //   분기를 *selene 시 다른 효과* 로 변경. 그러나 *우회 씬은 1 분기 plain 만*.
  //
  // 가장 자연: omphalos_cameo 의 walk_past (plain) → hecate 시 hidden 분기로
  //   [헤카테] 환영을 만들어 *빠른 도주*. condition.ability=hecate.
  {
    sceneId: 'omphalos_cameo',
    choice: {
      kind: 'conditional',
      id: 'hecate_illusion',
      label: '[헤카테] 환영을 던지고 — 너의 흔적 지운 채 떠난다.',
      condition: { kind: 'ability', required: 'hecate' },
      to: 'omphalos_station',
      hidden: true,
      stigmaDelta: 2, // 마법 소모
    },
    // omphalos_cameo 현재 분기: persuade_join(prob), exchange_intel(prob), walk_past(plain) = 3
    // → 한도 차. 한 plain 제거 또는 변경 필요.
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  for (const b of ABILITY_BRANCHES) {
    const cur = await Scene.findOne({ id: b.sceneId }).lean();
    if (!cur) { console.log('없음:', b.sceneId); continue; }
    const choices = [...(cur.choices ?? [])];
    if (choices.find((c) => c.id === b.choice.id)) {
      console.log('skip:', b.sceneId);
      continue;
    }
    // walk_past 제거 후 hecate_illusion 추가 (분기 3 한도 유지).
    const filtered = choices.filter((c) => c.id !== 'walk_past');
    filtered.push(b.choice);
    if (filtered.length > 3) {
      console.error(b.sceneId, filtered.length, '> 3');
      continue;
    }
    await Scene.findOneAndUpdate({ id: b.sceneId }, { choices: filtered });
    console.log('updated:', b.sceneId, '+', b.choice.id, '(walk_past 제거)');
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
