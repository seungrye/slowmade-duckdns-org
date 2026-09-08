#!/usr/bin/env node
// scripts/seed-magic-failure-stigma.mjs - #263's extra contamination on a failed spell.
//
// stigmaDeltaOnFailure is added to the *failure* of magic or magic-consuming choices.
// On success choice.stigmaDelta alone is enough (currently +2/+3). On failure the extra contamination stands for
// *losing control of the spell = a greater strain on the body*.

import mongoose from 'mongoose';

const magicChoicePatches = [
  // selene's magic (kael_infirmary)
  { sceneId: 'kael_infirmary', choiceId: 'overload_panel', stigmaDeltaOnFailure: 3 },
  // hecate's illusion (solwen_grove)
  { sceneId: 'solwen_grove', choiceId: 'frighten_chant', stigmaDeltaOnFailure: 2 },
  // hecate's illusion (solwen_combat)
  { sceneId: 'solwen_combat', choiceId: 'shield_spirit', stigmaDeltaOnFailure: 3 },
  // the intelligence magitech forgery (kael_corridor) - magitech = a small drain of magic
  { sceneId: 'kael_corridor', choiceId: 'forge_id', stigmaDeltaOnFailure: 2 },
  // the intelligence magitech hack (station_path_steel)
  { sceneId: 'station_path_steel', choiceId: 'hijack', stigmaDeltaOnFailure: 3 },
  // attuning to the rite through wisdom (climax_harmony_path) - the most dangerous magic
  { sceneId: 'climax_harmony_path', choiceId: 'still_the_engine', stigmaDeltaOnFailure: 10 },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const patch of magicChoicePatches) {
    const cur = await Scene.findOne({ id: patch.sceneId }).lean();
    if (!cur) {
      console.log('없음:', patch.sceneId);
      continue;
    }
    const choices = cur.choices.map((c) =>
      c.id === patch.choiceId
        ? { ...c, stigmaDeltaOnFailure: patch.stigmaDeltaOnFailure }
        : c,
    );
    await Scene.findOneAndUpdate({ id: patch.sceneId }, { choices });
    console.log('updated:', patch.sceneId, '/', patch.choiceId, `+${patch.stigmaDeltaOnFailure} 실패시`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
