#!/usr/bin/env node
// scripts/seed-omphalos-cameo.mjs — #274 옴팔로스 심층 1 단계 (omphalos_cameo).
//
// 디자인:
//   omphalos_blackmarket 의 hidden 분기 `meet_cameo` (sawOtherProtagonist 충족 시)
//     → 새 씬 `omphalos_cameo` — 다른 주인공의 후드 그림자와 짧은 마주침.
//       3 분기:
//         1. [cha 설득] 함께 가자 — int+cha 판정. 성공 → flag `recruitedOther`.
//         2. [int 교환] 정보만 — 단순 flag set `gainedOtherIntel`.
//         3. [외면] 갈 길을 간다 — flag 없음, 빠른 진행.
//       모두 omphalos_station 으로 이어진다.
//
// 후속 회차 활용: recruitedOther / gainedOtherIntel flag 는 station_knowledge_branch
// 또는 climax 의 추가 cutscene 자격으로 사용 가능 (다음 작업에서 확장).

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

  // 1) 신규 omphalos_cameo upsert.
  await Scene.findOneAndUpdate({ id: newScene.id }, newScene, { upsert: true, new: true });
  console.log('upsert: omphalos_cameo (3 분기)');

  // 2) omphalos_blackmarket 에 meet_cameo hidden 분기 추가 (3 분기 한도 검증).
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

  // 3) 후속 회차 효과 추가 — climax_revolution_path 에 *recruitedOther* 추가 cutscene
  //    (description 변경 + 분기 stigmaDelta -1) 같은 건 다음 단계 (#275) 에서.

  // 4) onEnter.setFlags 로 cameo 만남에서 별도 flag set 가능하지만,
  //    *어떻게 카메오에서 떠났는지* (설득/교환/외면) 는 분기 onEnter 가 아닌
  //    *분기 자체* 의 setFlags 가 필요. mongoose schema 가 choice.setFlags 를 받는지
  //    확인 후 시드 (이번 라운드는 *cameo 자체 진입* 까지만 — 다음 #275 에서 setFlags).
  console.log('NOTE: recruitedOther/gainedOtherIntel flag set 은 #275 에서.');

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
