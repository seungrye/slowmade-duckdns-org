#!/usr/bin/env node
// scripts/seed-wis-activation.mjs — #320 wis 분기 활용 +1.
//
// 현재 wis 분기 2 곳 — solwen_combat/shield_spirit (wis 13), climax_harmony_path/
// still_the_engine (wis 17). act1-act2 에 wis 0.
//
// 변경: omphalos_cameo/exchange_intel (plain) → wis 13 probability.
//   *지혜의 시야로 후드 그림자의 *진짜 정체* 간파*.

import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const cur = await Scene.findOne({ id: 'omphalos_cameo' }).lean();
  if (!cur) { console.log('없음'); process.exit(1); }
  const choices = cur.choices.map((c) => {
    if (c.id !== 'exchange_intel') return c;
    return {
      kind: 'probability',
      id: 'exchange_intel',
      label: '[지혜] 후드 너머의 *진짜 정체* — 그가 보는 것을 *나도 본다*.',
      stat: 'wis',
      difficulty: 13,
      onSuccess: 'omphalos_station',
      onFailure: 'omphalos_station',
      stigmaDeltaOnSuccess: 0,
      stigmaDeltaOnFailure: 2,
    };
  });
  await Scene.findOneAndUpdate({ id: 'omphalos_cameo' }, { choices });
  console.log('updated: omphalos_cameo/exchange_intel → wis 13 probability');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
