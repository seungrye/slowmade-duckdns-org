#!/usr/bin/env node
// scripts/seed-final-resort.mjs — #327 orphan 4 씬 정리.
//
// kael_caught / rin_chase / rin_caught — 우회 씬 (#318 신설) 의 *2 번째 분기*
// 로 재이용. *진짜 막다른 결단* (자결/항복) → 시나리오 ending.
//
// ending_petrification — reducer 의 isFullyPetrified 자동 ending 으로 *씬 미사용*.
//   EndingScreen 이 endingsMeta 만 본다. 별도 삭제 (deleteOne).

import mongoose from 'mongoose';

const REUSE_BRANCHES = [
  // kael_struggled 우회 씬에 *자결 분기* 추가 → kael_caught.
  {
    sceneId: 'kael_struggled',
    choice: {
      kind: 'plain',
      id: 'surrender_petrify',
      label: '[항복] 결정이 자라는 걸 받아들인다. 의식이 멀어지기 전에 — *자발적 정제소 이송*.',
      to: 'kael_caught',
    },
  },
  // rin_pursued 우회 씬에 *자수 분기* 추가 → rin_chase.
  {
    sceneId: 'rin_pursued',
    choice: {
      kind: 'plain',
      id: 'surrender_chase',
      label: '[항복] 휘장을 들어 보이고 — *공식 자수*. 추격은 끝난다.',
      to: 'rin_chase',
    },
  },
  // rin_betrayal_aftermath 우회 씬에 *자결 분기* 추가 → rin_caught.
  {
    sceneId: 'rin_betrayal_aftermath',
    choice: {
      kind: 'plain',
      id: 'surrender_caught',
      label: '[자결] 권총을 *내 가슴에 댄다*. 사제단의 손에 떨어질 바엔.',
      to: 'rin_caught',
    },
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // 1. 우회 씬에 *자결 plain 분기* 추가.
  for (const r of REUSE_BRANCHES) {
    const cur = await Scene.findOne({ id: r.sceneId }).lean();
    if (!cur) { console.log('없음:', r.sceneId); continue; }
    const choices = [...(cur.choices ?? [])];
    if (choices.find((c) => c.id === r.choice.id)) {
      console.log('skip:', r.sceneId);
      continue;
    }
    choices.push(r.choice);
    if (choices.length > 3) {
      console.error(r.sceneId, choices.length, '> 3'); continue;
    }
    await Scene.findOneAndUpdate({ id: r.sceneId }, { choices });
    console.log('재이용:', r.sceneId, '+', r.choice.id, '→', r.choice.to);
  }

  // 2. ending_petrification 삭제 — 자동 ending 잔재.
  const delResult = await Scene.deleteOne({ id: 'ending_petrification' });
  console.log('deleted: ending_petrification ×', delResult.deletedCount);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
