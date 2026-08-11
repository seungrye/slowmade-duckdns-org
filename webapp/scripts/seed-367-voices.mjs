#!/usr/bin/env node
// scripts/seed-367-voices.mjs — #73/#87 트리트먼트 + 문체 변형 적치.
//
// 왜 이 시드가 필요한가
//   treatment(사건의 뼈대·집필용 정본)와 variants(문체별 본문)는 그동안 **DB 에만** 있었다.
//   작업은 gitignore 된 일회성 스크립트로 했고 시드에는 한 줄도 남지 않았다. 그래서
//   seeds-replay.sh 로 재구축하면 72,458 자(트리트먼트 135 · 톨킨 135 · 에코 1)가 통째로
//   사라졌다. 재해 복구 경로에 구멍이 나 있던 셈이다.
//
//   데이터는 scripts/seed-voices-data.json 에 둔다(192KB — 시드 파일에 인라인하기엔 크다).
//   갱신할 때는 DB 에서 다시 덤프해 이 JSON 을 바꾼다.
//
// 멱등: 같은 값을 $set 하므로 두 번 돌려도 상태가 변하지 않는다.
//   updatedAt 은 **건드리지 않는다** — 그것까지 갱신하면 seed-idempotency 가 "변경됨" 으로
//   잡아낸다(그게 이 저장소의 규칙이다).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(resolve(HERE, 'seed-voices-data.json'), 'utf8'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');

  let touched = 0;
  let missing = 0;
  for (const [id, rec] of Object.entries(DATA)) {
    const set = {};
    if (rec.treatment) set.treatment = rec.treatment;
    if (rec.variants) {
      // variants 는 통째로 덮지 않고 키별로 넣는다 — 시드에 없는 문체를 지우지 않기 위함.
      for (const [voice, body] of Object.entries(rec.variants)) set[`variants.${voice}`] = body;
    }
    if (!Object.keys(set).length) continue;
    const r = await col.updateOne({ id }, { $set: set });
    if (!r.matchedCount) {
      console.warn(`  - 씬 없음(건너뜀): ${id}`);
      missing++;
      continue;
    }
    if (r.modifiedCount) touched++;
  }

  console.log(`seed-367-voices: 대상 ${Object.keys(DATA).length}개 / 변경 ${touched}개${missing ? ` / 없음 ${missing}개` : ''}`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-367-voices 실패:', e.message);
  process.exit(1);
});
