#!/usr/bin/env node
// scripts/seed-feather-use.mjs - #322: putting the inventory to use - the spirit_beast_feather hasItem branch.
//
// It is obtained in solwen_grief -> but *used* nowhere (0 hasItem conditions).
// Systemically it is a *decorative inventory* item.
//
// The change: a hidden hasItem(spirit_beast_feather) branch added to climax_sylvan_path.
//   *Holding the feather in your palm, you sing the world tree's complete song*.
//   stigmaDelta -5 (the contamination calmed by the spirit beast's protection).

import mongoose from 'mongoose';

const BRANCH = {
  sceneId: 'climax_sylvan_path',
  choice: {
    kind: 'conditional',
    id: 'feather_song',
    label: '[영수의 깃털] 손바닥에 쥐고 — *세계수의 완전한 노래* 를 부른다.',
    condition: { kind: 'hasItem', itemId: 'spirit_beast_feather' },
    to: 'ending_sylvan_bond',
    hidden: true,
    stigmaDelta: -5, // 영수의 가호
  },
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const cur = await Scene.findOne({ id: BRANCH.sceneId }).lean();
  if (!cur) { console.log('없음'); process.exit(1); }
  const choices = [...(cur.choices ?? [])];
  if (choices.find((c) => c.id === BRANCH.choice.id)) {
    console.log('skip'); process.exit(0);
  }
  choices.push(BRANCH.choice);
  if (choices.length > 3) {
    console.error('한도 초과'); process.exit(1);
  }
  await Scene.findOneAndUpdate({ id: BRANCH.sceneId }, { choices });
  console.log('updated:', BRANCH.sceneId, `(${choices.length} 분기)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
