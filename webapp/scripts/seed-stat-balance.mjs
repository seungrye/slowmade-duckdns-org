#!/usr/bin/env node
// scripts/seed-stat-balance.mjs — #319 6 스탯 활용 균형 + hasItem 조건 활성화.
//
// 현재 활용 매트릭스:
//   str: 2, dex: 6, int: 4 (+1 minStat), cha: 5, con: 1, wis: 2
//   → dex/cha 절반 / con/wis 거의 0
//
// 4 성흔 (lunar/selene/hecate/none) 별 특수 분기도 거의 없음.
// hasItem 조건 분기 0 — 인벤 시스템 데코레이션 상태.
//
// 라운드별 진행 (한 시드로 통합):
//   - con: kael_falling/rise_to_ground plain → con probability (추락 충격)
//   - wis: solwen_combat/shield_spirit 는 이미 wis 13 ✓ 유지
//   - hasItem: rin_evidence 에 imperial_seal hidden 분기 (사제단 인장 직접 활용)
//     + omphalos_blackmarket 에 service_revolver hidden 분기 (총으로 협박)
//   - 성흔 특수: ability 검사는 evalCondition 미지원 — 별도 시스템 (이번 fix 외)

import mongoose from 'mongoose';

const updates = [
  // 1. kael_falling/rise_to_ground plain → con probability.
  //    실패 시 신규 우회 씬 kael_falling_aftermath (hpΔ-5, 그 후 omphalos_outskirts 자동).
  {
    sceneId: 'kael_falling',
    choices: [
      {
        kind: 'probability',
        id: 'rise_to_ground',
        label: '[체력] 추락의 충격을 견디고 일어선다.',
        stat: 'con',
        difficulty: 12,
        onSuccess: 'omphalos_outskirts',
        onFailure: 'kael_falling_aftermath',
        stigmaDeltaOnFailure: 3,
      },
    ],
  },
];

const NEW_SCENES = [
  {
    id: 'kael_falling_aftermath',
    title: 'Scene 04-fail — 무릎이 굳었다',
    illustration: '/web-adventure/scenes/placeholder-square.svg',
    body: [
      '왼쪽 무릎이 *꺾인 채* 굳었다. 너는 그것을 *손으로 다시 밀어* 펴고, 비명조차 삼킨다.',
      '발걸음마다 *푸른 결정이 부서지는 소리*. 너의 체력은 한계 가까이.',
      '그러나 — 옴팔로스 외곽의 가스등이 너를 향해 가까이 온다. 살아 있다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'crawl_to_outskirts',
        label: '비틀거리며 — 옴팔로스 외곽으로.',
        to: 'omphalos_outskirts',
      },
    ],
    onEnter: {
      hpDelta: -5,
      stigmaDelta: 5,
    },
  },
];

const HASITEM_BRANCHES = [
  // rin_evidence 에 hasItem(imperial_seal) hidden 분기 — *바로 인장으로 위협*.
  {
    sceneId: 'rin_evidence',
    choice: {
      kind: 'conditional',
      id: 'flash_imperial_seal',
      label: '[사제단 인장] 인장을 들이대 — *그분* 의 권위로 자리를 뜬다.',
      condition: { kind: 'hasItem', itemId: 'imperial_seal' },
      to: 'rin_underground',
      hidden: true,
      stigmaDelta: 0,
    },
  },
  // omphalos_blackmarket 에 hasItem(service_revolver) hidden 분기 — *총으로 정보상 협박*.
  {
    sceneId: 'omphalos_blackmarket',
    choice: {
      kind: 'conditional',
      id: 'threaten_with_revolver',
      label: '[수사관 권총] 총구를 들이대 — 진실을 *지금* 들고 떠난다.',
      condition: { kind: 'hasItem', itemId: 'service_revolver' },
      to: 'omphalos_station',
      hidden: true,
      stigmaDelta: 0,
    },
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // 1. 신규 씬 upsert.
  //    기존 illustration 이 placeholder 가 아니면 painter 가 생성한 실 URL — 보존.
  for (const s of NEW_SCENES) {
    const cur = await Scene.findOne({ id: s.id }).lean();
    const update = { ...s };
    if (cur && cur.illustration && !cur.illustration.includes('placeholder')) {
      update.illustration = cur.illustration;
    }
    await Scene.findOneAndUpdate({ id: s.id }, update, { upsert: true, new: true });
    console.log('upsert:', s.id);
  }

  // 2. 기존 분기 변경 (rise_to_ground plain → probability).
  for (const u of updates) {
    const cur = await Scene.findOne({ id: u.sceneId }).lean();
    if (!cur) { console.log('없음:', u.sceneId); continue; }
    // u.choices 의 각 id 에 매칭 — 기존 분기와 합치되 *id 매칭은 덮어쓰기*.
    const map = new Map(cur.choices.map((c) => [c.id, c]));
    for (const c of u.choices) map.set(c.id, c);
    const merged = [...map.values()];
    await Scene.findOneAndUpdate({ id: u.sceneId }, { choices: merged });
    console.log('updated:', u.sceneId, `(${merged.length} 분기)`);
  }

  // 3. hasItem 분기 추가 (3 분기 한도 검증).
  for (const b of HASITEM_BRANCHES) {
    const cur = await Scene.findOne({ id: b.sceneId }).lean();
    if (!cur) { console.log('없음:', b.sceneId); continue; }
    const choices = [...(cur.choices ?? [])];
    if (choices.find((c) => c.id === b.choice.id)) {
      console.log('skip:', b.sceneId, '/', b.choice.id);
      continue;
    }
    choices.push(b.choice);
    if (choices.length > 3) {
      console.error(b.sceneId, choices.length, '> 3 — 거부');
      continue;
    }
    await Scene.findOneAndUpdate({ id: b.sceneId }, { choices });
    console.log('hasItem:', b.sceneId, '/', b.choice.id, `(${choices.length} 분기)`);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
