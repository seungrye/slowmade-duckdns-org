#!/usr/bin/env node
// scripts/seed-npc-names.mjs — #278 사이드 NPC 이름 부여.
//
// 익명 → 이름. 다크 에픽 톤. 추가 1 줄 (또는 기존 줄 교체) 로 자연스럽게.
//
// 명단:
//   군의관 (kael_infirmary)          → "벤딕트 박사"
//   상급 수사관 (rin_betrayal)       → "호프만 수사관장"
//   정보상 (omphalos_blackmarket)    → "그라모르"
//   영수 (solwen_grief)              → "흰눈 (영수의 이름)"
//   청소부 노인 (kael_corridor_clear)→ "마릭 영감"
// 후드 그림자 (omphalos_cameo) — *모호함* 이 디자인 의도, 이름 부여 X.

import mongoose from 'mongoose';

const patches = [
  {
    id: 'kael_infirmary',
    insertAt: 2,
    line: '벤딕트 박사가 차트를 넘긴다. *그는 군의관 출신, 사제단 합류 3 년차*. 너의 옛 부대 동기였던 *링크 하사* 도 그의 손에서 정제소로 보내졌다.',
  },
  {
    id: 'rin_betrayal',
    insertAt: 1,
    line: '*호프만 수사관장* — 너에게 처음 검사 휘장을 쥐어준 사람. 너는 그를 *아버지처럼* 따랐다. 그는 이제 너를 *너처럼 가지 않는 사람* 으로 본다.',
  },
  {
    id: 'omphalos_blackmarket',
    insertAt: 2,
    line: '정보상은 자신을 *그라모르* 라고 소개한다. 한쪽 눈은 마력석 의안. *세 도시 군대* 가 모두 그의 정보를 산다고 한다.',
  },
  {
    id: 'solwen_grief',
    insertAt: 0,
    line: '*흰눈* — 영수 사슴의 이름. 너의 할머니가 너를 안고 처음 그에게 인사했을 때, 너에게 *심장의 박동을 한 번 빌려준* 자.',
  },
  {
    id: 'kael_corridor_clear',
    insertAt: 2,
    line: '청소부 노인은 자신을 *마릭 영감* 이라 부른다. 정제소에서 *세 번 살아 돌아온 자* — 사람들은 그의 핏줄에 흐르는 푸른 결정이 *그의 죄* 라고 수군거린다.',
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const p of patches) {
    const cur = await Scene.findOne({ id: p.id }).lean();
    if (!cur) { console.log('없음:', p.id); continue; }
    const body = [...(cur.body ?? [])];
    if (body.includes(p.line)) { console.log('skip:', p.id); continue; }
    body.splice(p.insertAt, 0, p.line);
    await Scene.findOneAndUpdate({ id: p.id }, { body });
    console.log('updated:', p.id, `(${body.length} 줄)`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
