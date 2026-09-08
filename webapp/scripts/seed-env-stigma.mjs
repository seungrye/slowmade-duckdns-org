#!/usr/bin/env node
// scripts/seed-env-stigma.mjs - #264's environmental contamination (onEnter.stigmaDelta).
//
// *Even when the protagonist does nothing*, the contamination rises slightly from the place itself - a leaking magic field, the residue
// of the priesthood's rite, the world tree's roots trembling, and so on.

import mongoose from 'mongoose';

// The scenes whose environment itself contaminates, plus the delta.
const envStigma = [
  // Omphalos - the leaking petrol plus the priesthood's vast magic field.
  { id: 'omphalos_outskirts', stigmaDelta: 1 },
  { id: 'omphalos_station', stigmaDelta: 2 },
  { id: 'omphalos_blackmarket', stigmaDelta: 1 },
  // the climax - all at the heart of a vast magic field.
  { id: 'climax_ascension_path', stigmaDelta: 3 },
  { id: 'climax_harmony_path', stigmaDelta: 2 },
  { id: 'climax_revolution_path', stigmaDelta: 2 },
  { id: 'climax_fall_path', stigmaDelta: 3 },
  { id: 'climax_sylvan_path', stigmaDelta: 1 }, // 세계수의 정화 효과
  // The stages between stations - a magic leak.
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
