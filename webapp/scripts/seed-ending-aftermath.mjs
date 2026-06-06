#!/usr/bin/env node
// scripts/seed-ending-aftermath.mjs — #275 엔딩 후일담.
//
// 각 ending 씬 본문 끝에 *— 세 달 후 / 다음 세대* 톤의 후일담 1 줄 추가.
// endingsMeta.epilogue 는 갤러리 카드용 (짧음) 으로 유지 — ending 씬 본문은 full
// epilogue + 후일담.
//
// 회차 시스템의 *부메랑* 의미를 강화 — 한 모험의 결과가 *다음 세대* 에 어떻게
// 남는가.

import mongoose from 'mongoose';

const aftermaths = {
  ending_ascension:
    '— 세 달 후. 새로 든 사제단 견습이 *옛 카엘* 이라는 이름을 책에서 마주친다. 의식의 마지막 자격자였다고 한다. 그가 누구였는지는 — *이미 잊혀졌다*.',
  ending_revolution:
    '— 다음 봄. 광장에 어린아이가 "마법" 이라는 단어를 책에서 처음 보고 묻는다. 어른들이 잠시 머뭇거린 후, *옛 이야기일 뿐이라고* 답한다. 망치 끝에 새 첨탑이 솟아오른다.',
  ending_harmony:
    '— 새벽. 어느 시골 마을의 우물 옆, 한 노인이 *옛 세계수의 노래* 를 한 줄 흥얼거린다. 아이가 그 곡을 외운다. 이름은 모르지만 — 마음에 *오래 남는 박동* 이 있다.',
  ending_fall:
    '— 누군가는 살아남는다. 잿더미 위에 핀 한 줄기 푸른 풀잎. 그것을 처음 본 아이의 손바닥에 *희미한 마력 흔적* 이 떠오른다. 다른 이야기가 시작된다.',
  ending_petrification:
    '— 너의 결정체에서 흘러나온 푸른 빛이 다른 이의 등불이 되었다. 이름은 잊혔지만 빛은 *남았다*. 누군가 그 빛 아래에서 새 결단을 내린다.',
  ending_sylvan_bond:
    '— 도시들이 *기억 속에만* 남은 후, 영수가 새 인간의 아이 하나를 키운다. 그 아이가 자라 *옛 솔벤의 노래* 를 한 소절 기억한다 — 자신의 노래라고 믿으면서.',
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const [id, line] of Object.entries(aftermaths)) {
    const cur = await Scene.findOne({ id }).lean();
    if (!cur) { console.log('없음:', id); continue; }
    const body = [...(cur.body ?? [])];
    if (body.includes(line)) { console.log('skip (이미 추가):', id); continue; }
    body.push(line);
    await Scene.findOneAndUpdate({ id }, { body });
    console.log('updated:', id, `+ 후일담 1 줄 (총 ${body.length} 줄)`);
  }
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
