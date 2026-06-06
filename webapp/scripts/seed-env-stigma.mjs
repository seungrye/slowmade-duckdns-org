#!/usr/bin/env node
// scripts/seed-env-stigma.mjs — #264 환경 침식 (onEnter.stigmaDelta).
//
// *주인공이 어떤 행동도 하지 않아도* 그 장소 자체의 마력장 누출 / 사제단 의식
// 잔향 / 세계수 뿌리 진동 등으로 침식이 미세하게 증가한다.

import mongoose from 'mongoose';

// 환경 자체가 침식하는 씬 + delta.
const envStigma = [
  // 옴팔로스 — 가솔린 누출 + 사제단 의식의 거대 마력장.
  { id: 'omphalos_outskirts', stigmaDelta: 1 },
  { id: 'omphalos_station', stigmaDelta: 2 },
  { id: 'omphalos_blackmarket', stigmaDelta: 1 },
  // climax — 모두 거대한 마력장의 중심.
  { id: 'climax_ascension_path', stigmaDelta: 3 },
  { id: 'climax_harmony_path', stigmaDelta: 2 },
  { id: 'climax_revolution_path', stigmaDelta: 2 },
  { id: 'climax_fall_path', stigmaDelta: 3 },
  { id: 'climax_sylvan_path', stigmaDelta: 1 }, // 세계수의 정화 효과
  // station 간 단계 — 마력 누출.
  { id: 'station_path_steel', stigmaDelta: 1 },
  { id: 'station_knowledge_branch', stigmaDelta: 1 },
  { id: 'station_spirit_branch', stigmaDelta: 0 }, // 세계수 영역 = 정화
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const u of envStigma) {
    const cur = await Scene.findOne({ id: u.id }).lean();
    if (!cur) {
      console.log('skip:', u.id);
      continue;
    }
    const onEnter = { ...(cur.onEnter ?? {}), stigmaDelta: u.stigmaDelta };
    await Scene.findOneAndUpdate({ id: u.id }, { onEnter });
    console.log('updated:', u.id, `env stigma +${u.stigmaDelta}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
