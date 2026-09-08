#!/usr/bin/env node
// scripts/seed-harmony-expand.mjs - #265: the sawOtherProtagonist flag added at the black market too.
//
// The black market's body already carries the *running into another protagonist* narrative. The qualifying flag is added:
//   sawOtherProtagonist: true
// It can qualify a new branch added later (sabotaging the rite at the black market, for instance). For now only
// the flag is stated.

import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const cur = await Scene.findOne({ id: 'omphalos_blackmarket' }).lean();
  if (!cur) { console.log('없음'); process.exit(1); }
  const onEnter = {
    ...cur.onEnter,
    setFlags: { ...(cur.onEnter?.setFlags ?? {}), sawOtherProtagonist: true },
  };
  await Scene.findOneAndUpdate({ id: 'omphalos_blackmarket' }, { onEnter });
  console.log('updated: omphalos_blackmarket — sawOtherProtagonist:true');
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
