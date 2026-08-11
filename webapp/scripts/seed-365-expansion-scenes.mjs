#!/usr/bin/env node
// scripts/seed-365-expansion-scenes.mjs — 씬 확장분 적치 (재해 복구 구멍 메우기).
//
// 왜 필요한가
//   seeds-replay.sh 로 빈 mongo 를 재구축하면 125 개 씬만 생겼다. 프로덕션에는 135 개가
//   있다. 차이 10 개는 뒤에 「작가노트를 반영한 씬 확장」으로 만든 것들인데, 그 작업이
//   시드에 한 줄도 남지 않았다. 그 씬들을 가리키는 **부모 씬의 선택지**도 함께 빠져 있었다.
//
//   재구축본이 깨져 보이지는 않는다(깨진 링크 0). 확장 이전 상태로 자체 완결되기 때문이다.
//   그래서 더 위험했다 — 복구해 놓고도 무엇이 사라졌는지 알아채기 어렵다.
//
// 무엇을 넣나
//   · 확장 씬 10 개: 성흔별 조화 분기 4(lunar/selene/hecate/none), 카엘 회상 2
//     (kael_gate_recall · kael_marik_truth), 솔벤 유대 2(bond_accept · bond_echo),
//     설화 확장 2(tale_knight_past · tale_serum_ward)
//   · 그 씬들로 가는 길을 여는 부모 6 개의 choices
//
//   데이터는 scripts/seed-expansion-data.json. treatment/variants 는 넣지 않는다 —
//   그쪽은 seed-367-voices 담당이라 **이 시드가 먼저** 돌아 씬을 만들어 두어야 한다.
//
// 멱등: 씬은 $set upsert, 선택지는 같은 값이면 mongo 가 변경으로 치지 않는다.
//   updatedAt 은 건드리지 않는다(seed-idempotency 규칙).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const HERE = dirname(fileURLToPath(import.meta.url));
const { scenes, choices } = JSON.parse(readFileSync(resolve(HERE, 'seed-expansion-data.json'), 'utf8'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');

  let created = 0;
  let updated = 0;
  for (const scene of scenes) {
    const r = await col.updateOne({ id: scene.id }, { $set: scene }, { upsert: true });
    if (r.upsertedCount) created++;
    else if (r.modifiedCount) updated++;
  }

  let wired = 0;
  for (const [id, list] of Object.entries(choices)) {
    const r = await col.updateOne({ id }, { $set: { choices: list } });
    if (!r.matchedCount) { console.warn(`  - 부모 씬 없음: ${id}`); continue; }
    if (r.modifiedCount) wired++;
  }

  console.log(`seed-365-expansion-scenes: 씬 생성 ${created} / 갱신 ${updated} / 부모 선택지 ${wired}`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-365-expansion-scenes 실패:', e.message);
  process.exit(1);
});
