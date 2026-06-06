#!/usr/bin/env node
// scripts/seed-harmony-expand.mjs — #265 블랙마켓에서 sawOtherProtagonist flag 도 추가.
//
// 이미 블랙마켓 본문은 *다른 주인공 마주침* 내러티브를 담고 있다. 자격 flag 추가:
//   sawOtherProtagonist: true
// 추후 추가 신규 분기 (예: 블랙마켓 의식 사보타지) 자격으로 사용 가능. 현재는
// flag 만 명시.

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
