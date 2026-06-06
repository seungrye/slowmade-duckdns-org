#!/usr/bin/env node
// scripts/seed-npc-dialogue.mjs — 사이드 NPC 짧은 대사 추가 (#260).
//
// 옴팔로스 블랙마켓의 정보상, 솔라리스 군의관, 사제단 사자, 영수의 목소리 등을
// 본문 일부에 인용 형태로 삽입해 세계관 분위기 풍부화.

import mongoose from 'mongoose';

const updates = [
  {
    id: 'kael_infirmary',
    appendBody: [
      '"…카엘 하사는 좋은 군인이었군. 헌신에 경의를." 군의관의 목소리는 진심처럼 들린다. 그것이 더 무섭다.',
    ],
  },
  {
    id: 'rin_evidence',
    appendBody: [
      '체포된 밀수꾼이 너의 발 밑에 꿇어앉는다. "수사관, 그건… *그분* 의 것이오. 만지면 안 됐어. 우리 모두 매장당할 거요."',
    ],
  },
  {
    id: 'solwen_grief',
    appendBody: [
      '영수의 마지막 숨결 속에서 너는 *목소리* 를 듣는다. 종족의 가장 오래된 노래로 — *"숲은 잠들지 않았어. 단지 우리가 깨우는 법을 잊었을 뿐."*',
    ],
  },
  {
    id: 'omphalos_blackmarket',
    appendBody: [
      '정보상이 너의 손에 쥐여준 종이쪽지의 끝에 작은 글씨가 있다. "*그들 중 하나는 너를 알고 있다. 다른 둘은 너와 같은 적을 본다. 만나라.*"',
    ],
  },
  // #304 — omphalos_station 의 사자 대사는 *seed-station-restructure 가 이미 포함* (body 정의 시).
  //   여기서 append 하면 station-restructure 후속 시 중복. 제거.
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const u of updates) {
    const cur = await Scene.findOne({ id: u.id }).lean();
    if (!cur) {
      console.log('skip (없음):', u.id);
      continue;
    }
    // #304 idempotent — 이미 append 된 라인 skip (재실행 안전).
    const body = [...(cur.body ?? [])];
    let added = 0;
    for (const line of u.appendBody) {
      if (!body.includes(line)) {
        body.push(line);
        added++;
      }
    }
    if (added === 0) {
      console.log('skip (이미 추가):', u.id);
      continue;
    }
    await Scene.findOneAndUpdate({ id: u.id }, { body });
    console.log('appendBody:', u.id, `(+${added})`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
