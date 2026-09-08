#!/usr/bin/env node
// scripts/seed-ability-branches.mjs - #321's differentiating branches for the 4 stigmata.
//
// The ability kind was added to evalCondition (the system) - this seed is *the content's application*.
//
// A *special hidden branch* per stigma - one place each (keeping the 3-branch limit).
//   selene (a str bonus, combat): a new hidden branch in solwen_combat
//   hecate (a cha bonus, illusion): omphalos_blackmarket - hard to add at the limit -> the cameo is used
//   lunar  (an int bonus, magic): kael_corridor - hard to add at the limit -> its own place
//   none   (unmarked, 3 rerolls): *attempting the usually dangerous branch with a reroll* - a systemic meaning only,
//                            with no branch of its own

import mongoose from 'mongoose';

const ABILITY_BRANCHES = [
  // selene = +2 in combat (str). A hidden *flame through selene's magic* branch in solwen_combat.
  // solwen_combat currently has shoot_canister / shield_spirit / spirit_guidance (3 branches)
  // -> at the limit, so nothing can be added. Skipped.
  // station_path_steel instead (currently 3 branches) - also at the limit.
  // -> a new place: changing the plain branch of a *detour scene* such as kael_caught_minor / kael_struggled / kael_falling_aftermath
  //   to *a different effect under selene*. But *a detour scene has only 1 plain branch*.
  //
  // The most natural: omphalos_cameo's walk_past (plain) -> under hecate, a hidden branch that
  //   conjures an illusion for *a swift escape*. condition.ability=hecate.
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
    // walk_past is removed and hecate_illusion added (keeping the 3-branch limit).
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
