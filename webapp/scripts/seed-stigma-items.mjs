#!/usr/bin/env node
// scripts/seed-stigma-items.mjs - adding places to obtain the refined water and the shard (#261).
//
// No scene in mongo currently gives ether_refined_water or mana_stone_fragment.
// The system works but *the player cannot obtain them* -> the contamination up-and-down trade-off is impossible.
//
// The placements:
//   1. kael_corridor          - 1 refined water in the infirmary's medicine cabinet.
//   2. kael_cargo_container   - 1 shard in the emergency box beside the petrol drum (added to the existing ether_gas_canister).
//   3. rin_evidence           - 1 refined water beside the priesthood's seal.
//   4. solwen_grief           - 1 shard with the spirit beast's last breath (its crystal).
//   5. omphalos_blackmarket   - the black market's informant offers 1 refined water plus 1 shard as a package.

import mongoose from 'mongoose';

const updates = [
  {
    id: 'kael_corridor',
    addItems: ['ether_refined_water'],
    bodyHint: '복도 옆 약품 캐비닛이 잠겨 있지 않다. 푸른 액체 한 병 — *에테르 정제수*. 한 모금이면 침식이 잠시 멎는다.',
  },
  {
    id: 'kael_cargo_container',
    addItems: ['mana_stone_fragment'],
    bodyHint: '컨테이너 옆 비상함에서 *마력석 파편* 하나가 굴러 나온다. 손바닥에서 따끔하게 깨어 있다.',
  },
  {
    id: 'rin_evidence',
    addItems: ['ether_refined_water'],
    bodyHint: '인장과 함께 *작은 푸른 병* 도 있다. 사제단의 표식이 찍힌 에테르 정제수.',
  },
  {
    id: 'solwen_grief',
    addItems: ['mana_stone_fragment'],
    bodyHint: '영수의 가슴 한가운데에서 빛나는 *작은 결정* — 마력석 파편이 된 영수의 마지막 호흡.',
  },
  {
    id: 'omphalos_blackmarket',
    addItems: ['ether_refined_water', 'mana_stone_fragment'],
    bodyHint: '정보상이 작은 자루를 너에게 던진다. "이것도 가져가. *정제수 한 병, 파편 하나.* 너 같은 자에게는 둘 다 필요할 거야."',
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const u of updates) {
    const cur = await Scene.findOne({ id: u.id }).lean();
    if (!cur) {
      console.log('skip (없음):', u.id);
      continue;
    }
    // A hint line is appended to the body (skipped when already there).
    const body = [...(cur.body ?? [])];
    if (u.bodyHint && !body.some((p) => p === u.bodyHint)) {
      body.push(u.bodyHint);
    }
    // onEnter.addItems is merged (the existing plus the new).
    const existingItems = cur.onEnter?.addItems ?? [];
    const merged = [...existingItems];
    for (const id of u.addItems) {
      if (!merged.includes(id)) merged.push(id);
    }
    await Scene.findOneAndUpdate(
      { id: u.id },
      {
        body,
        'onEnter.addItems': merged,
        ...(cur.onEnter?.setFlags ? { 'onEnter.setFlags': cur.onEnter.setFlags } : {}),
      },
    );
    console.log('updated:', u.id, '→ items:', merged.join(','));
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
