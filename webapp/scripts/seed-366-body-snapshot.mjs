#!/usr/bin/env node
// scripts/seed-366-body-snapshot.mjs — 씬 본문(body) 정본 고정.
//
// 왜 스냅샷인가
//   seeds-replay 로 빈 mongo 를 재구축한 뒤 프로덕션과 대조하니 **23 개 씬의 body 가
//   달랐다.** 줄 수가 같은데 내용이 다른 것도 있었다. 오래 누적된 드리프트다 — CMS 편집과
//   일회성 스크립트로 프로덕션만 고쳐 온 결과이고, 시드에는 그 이력이 없다.
//
//   증분 patch 를 하나씩 되짚어 맞추는 것은 사실상 불가능하고, 맞춘다 해도 다음 편집에서
//   또 갈린다. 시드의 목적은 「역사 재현」이 아니라 「복구 가능성」이므로, 지금 프로덕션을
//   정본으로 삼아 마지막에 한 번 고정한다.
//
// 그래서 이 시드는 앞선 patch 들이 만든 body 를 **최종 상태로 덮는다.** 앞의 시드들이
// 무의미해지는 것은 아니다 — 씬 골격·선택지·플래그는 여전히 그쪽이 만든다.
//
// ⚠ 콘텐츠를 고치면 이 스냅샷도 갱신해야 한다. 갱신을 잊으면 재구축이 옛 본문으로 돌아간다.
//   갱신: mongo 에서 body 를 덤프해 scripts/seed-body-data.json 을 바꾼다.
//
// 멱등: 같은 값을 $set 하므로 두 번 돌려도 변경이 없다. updatedAt 은 건드리지 않는다.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(resolve(HERE, 'seed-body-data.json'), 'utf8'));

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');
  let changed = 0;
  let missing = 0;
  for (const [id, body] of Object.entries(DATA)) {
    const r = await col.updateOne({ id }, { $set: { body } });
    if (!r.matchedCount) { missing++; continue; }
    if (r.modifiedCount) changed++;
  }
  console.log(`seed-366-body-snapshot: 대상 ${Object.keys(DATA).length}개 / 변경 ${changed}${missing ? ` / 없음 ${missing}` : ''}`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-366-body-snapshot 실패:', e.message);
  process.exit(1);
});
