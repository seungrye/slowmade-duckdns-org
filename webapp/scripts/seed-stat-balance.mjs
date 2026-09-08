#!/usr/bin/env node
// scripts/seed-stat-balance.mjs - #319: balancing the use of the 6 stats plus activating the hasItem condition.
//
// The current usage matrix:
//   str: 2, dex: 6, int: 4 (+1 minStat), cha: 5, con: 1, wis: 2
//   -> dex/cha at half, con/wis at almost 0
//
// There are also almost no special branches per stigma (lunar/selene/hecate/none).
// 0 hasItem condition branches - the inventory system is decorative.
//
// The rounds (combined into one seed):
//   - con: kael_falling/rise_to_ground plain -> a con probability (the fall's impact)
//   - wis: solwen_combat/shield_spirit already has wis 13, kept as it is
//   - hasItem: a hidden imperial_seal branch in rin_evidence (using the priesthood's seal directly)
//     plus a hidden service_revolver branch in omphalos_blackmarket (threatening at gunpoint)
//   - the stigma specials: evalCondition does not support an ability check - a separate system (outside this fix)

import mongoose from 'mongoose';

const updates = [
  // 1. kael_falling/rise_to_ground plain → con probability.
  //    On failure, the new detour scene kael_falling_aftermath (hp -5, then on to omphalos_outskirts automatically).
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
  // A hidden hasItem(imperial_seal) branch in rin_evidence - *threatening with the seal at once*.
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
  // A hidden hasItem(service_revolver) branch in omphalos_blackmarket - *threatening the informant at gunpoint*.
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

  // 1. upserting the new scenes.
  //    An existing illustration that is not a placeholder is a real URL painter generated - preserved.
  for (const s of NEW_SCENES) {
    const cur = await Scene.findOne({ id: s.id }).lean();
    const update = { ...s };
    if (cur && cur.illustration && !cur.illustration.includes('placeholder')) {
      update.illustration = cur.illustration;
    }
    await Scene.findOneAndUpdate({ id: s.id }, update, { upsert: true, new: true });
    console.log('upsert:', s.id);
  }

  // 2. changing the existing branch (rise_to_ground plain -> probability).
  for (const u of updates) {
    const cur = await Scene.findOne({ id: u.sceneId }).lean();
    if (!cur) { console.log('없음:', u.sceneId); continue; }
    // Matched by each id in u.choices - merged with the existing branches, but *a matching id is overwritten*.
    const map = new Map(cur.choices.map((c) => [c.id, c]));
    for (const c of u.choices) map.set(c.id, c);
    const merged = [...map.values()];
    await Scene.findOneAndUpdate({ id: u.sceneId }, { choices: merged });
    console.log('updated:', u.sceneId, `(${merged.length} 분기)`);
  }

  // 3. adding the hasItem branches (the 3-branch limit is checked).
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
