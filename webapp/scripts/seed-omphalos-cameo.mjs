#!/usr/bin/env node
// scripts/seed-omphalos-cameo.mjs - #274's Omphalos depth, stage 1 (omphalos_cameo).
//
// The design:
//   omphalos_blackmarket's hidden `meet_cameo` branch (when sawOtherProtagonist is met)
//     -> the new scene `omphalos_cameo` - a brief encounter with another protagonist's hooded shadow.
//       3 branches:
//         1. [cha persuasion] come with me - an int+cha roll. Success -> the `recruitedOther` flag.
//         2. [int exchange] information only - a plain flag set, `gainedOtherIntel`.
//         3. [look away] you go your way - no flag, a quick move on.
//       All lead on to omphalos_station.
//
// Use in later runs: the recruitedOther / gainedOtherIntel flags can qualify an extra cutscene in station_knowledge_branch
// or the climax (extended in a later task).

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

const newScene = {
  id: 'omphalos_cameo',
  title: 'Scene 06b — 후드 그림자',
  illustration: PLACEHOLDER,
  body: [
    '가스등이 깜빡이는 좁은 골목. 너의 발걸음이 멎는다 — 너의 *그림자가 두 개*. 다른 하나가 너를 향해 천천히 고개를 든다.',
    '후드 아래로 푸른 마력 흔적이 옅게 빛난다. *같은 병에 걸린* 자의 표식. 이름은 모른다. 그러나 너의 가슴이 *왠지 익숙한 박동* 으로 응답한다.',
    '*"... 너도 솔라리스의 의식을 알고 있나?"* 그가 작게 묻는다.',
  ],
  choices: [
    {
      kind: 'probability',
      id: 'persuade_join',
      label: '[설득] 함께 가자 — 같은 적, 같은 길.',
      stat: 'cha',
      difficulty: 13,
      onSuccess: 'omphalos_station',
      onFailure: 'omphalos_station',
      stigmaDeltaOnSuccess: 0,
      stigmaDeltaOnFailure: 1,
    },
    {
      kind: 'plain',
      id: 'exchange_intel',
      label: '[교환] 정보만 — 너의 길은 따로.',
      to: 'omphalos_station',
    },
    {
      kind: 'plain',
      id: 'walk_past',
      label: '[외면] 갈 길을 간다 — 누구도 믿지 않는다.',
      to: 'omphalos_station',
    },
  ],
  onEnter: {
    stigmaDelta: 1, // 마력 표식이 서로 반응 — 미세 침식.
  },
};

const blackmarketPatch = {
  kind: 'conditional',
  id: 'meet_cameo',
  label: '[후드 그림자] 골목 끝의 다른 인영 — 너처럼 표식을 가진 자.',
  condition: { kind: 'flag', key: 'sawOtherProtagonist' },
  to: 'omphalos_cameo',
  hidden: true,
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // 1) upserting the new omphalos_cameo.
  //    An existing illustration that is not a placeholder is a real URL painter generated - preserved.
  const curCameo = await Scene.findOne({ id: newScene.id }).lean();
  const cameoUpdate = { ...newScene };
  if (curCameo && curCameo.illustration && !curCameo.illustration.includes('placeholder')) {
    cameoUpdate.illustration = curCameo.illustration;
  }
  await Scene.findOneAndUpdate({ id: newScene.id }, cameoUpdate, { upsert: true, new: true });
  console.log('upsert: omphalos_cameo (3 분기)');

  // 2) adding the hidden meet_cameo branch to omphalos_blackmarket (the 3-branch limit is checked).
  const bm = await Scene.findOne({ id: 'omphalos_blackmarket' }).lean();
  if (!bm) { console.error('blackmarket 없음'); process.exit(1); }
  const choices = [...(bm.choices ?? [])];
  if (!choices.find((c) => c.id === 'meet_cameo')) {
    choices.push(blackmarketPatch);
  }
  if (choices.length > 3) {
    console.error(`blackmarket ${choices.length} > 3 — 추가 거부`);
    process.exit(1);
  }
  await Scene.findOneAndUpdate({ id: 'omphalos_blackmarket' }, { choices });
  console.log(`updated: omphalos_blackmarket → ${choices.length} 분기 (meet_cameo hidden 포함)`);

  // 3) adding the later-run effects - something like a *recruitedOther* extra cutscene in climax_revolution_path
  //    (a changed description plus a branch stigmaDelta -1) comes in the next stage (#275).

  // 4) onEnter.setFlags could set its own flag on meeting the cameo, but
  //    *how you left the cameo* (persuading, exchanging, looking away) needs setFlags on
  //    *the branch itself* rather than the branch's onEnter. It will be seeded once whether the mongoose schema accepts
  //    choice.setFlags is confirmed (this round goes only as far as *entering the cameo* - setFlags comes in #275).
  console.log('NOTE: recruitedOther/gainedOtherIntel flag set 은 #275 에서.');

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
