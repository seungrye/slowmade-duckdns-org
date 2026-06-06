#!/usr/bin/env node
// scripts/seed-npc-flavor.mjs — #267 사이드 NPC 대사로 분위기 보강.
//
// 약한 (≤2줄) 씬에 NPC/내러티브 한 두 줄 추가. 침식/사제단/세계수 단서를 흘려
// 플레이어가 다음 결정의 *맥락* 을 더 잘 잡도록.

import mongoose from 'mongoose';

const patches = [
  {
    id: 'kael_corridor_clear',
    add: [
      '복도 끝에서 청소부 노인이 너를 흘긋 본다. *"엔지니어 양반, 손 끝이 푸르네... 자네도 그 *축복* 받았나? 정제소에서 잘 가신 동료들이 많아."*',
      '노인의 빗자루가 바닥의 푸른 가루를 쓸어 모은다. 작업복 안주머니에서 작은 파편이 묵직하게 느껴진다.',
    ],
  },
  {
    id: 'station_path_steel',
    add: [
      '아이언가드 정찰병 하나가 너를 보고 손을 든다. *"본대는 화물칸 위에 매복. 신호를 줘."*',
      '망치 손잡이가 그의 어깨에 걸려 있다. 너의 결정 하나면 — 그가 죽거나, 산다.',
    ],
  },
  {
    id: 'station_knowledge_branch',
    add: [
      '한 사제단의 견습이 너의 발치에 떨어진 두루마리를 줍는다. 손이 떨린다. *"...너는, 본 의식의 자격자인가?"*',
      '그의 눈에서 두려움인지 희망인지 모를 빛이 일렁인다. 너는 그 둘 모두를 본 적이 있다 — 자신의 눈동자에서.',
    ],
  },
  {
    id: 'station_spirit_branch',
    add: [
      '세계수의 가지 끝에서 작은 영수가 너의 귀에 속삭인다. *"잠든 것을 깨우는 것은 — 깨우는 자도 함께 잠들게 한다."*',
      '영수의 깃털이 너의 손등에 닿는 순간, 침식 자국이 잠시 *빛을 머금는다*. 따스함과 슬픔이 함께 흐른다.',
    ],
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const p of patches) {
    const cur = await Scene.findOne({ id: p.id }).lean();
    if (!cur) { console.log('없음:', p.id); continue; }
    const body = [...(cur.body ?? [])];
    let added = 0;
    for (const line of p.add) {
      if (!body.includes(line)) { body.push(line); added++; }
    }
    if (added === 0) { console.log('skip (이미 추가됨):', p.id); continue; }
    await Scene.findOneAndUpdate({ id: p.id }, { body });
    console.log('updated:', p.id, `+${added} 줄`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
