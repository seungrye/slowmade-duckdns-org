#!/usr/bin/env node
// scripts/seed-354-reroll-boost.mjs - the +1 reroll top-up event (shared, protagonist-independent).
// Entering omphalos_blackmarket (an optional shared scene every protagonist can reach) gives +1 reroll.
// onEnter.rerollDelta=1 plus one line of body. Idempotent (no duplication).
import mongoose from 'mongoose';
async function main(){
  await mongoose.connect(process.env.MONGO_URI);
  const S=mongoose.model('S',new mongoose.Schema({},{strict:false,collection:'webadventurescenes'}));
  const s=await S.findOne({id:'omphalos_blackmarket'}).lean();
  if(!s){console.error('omphalos_blackmarket 없음');process.exit(1);}
  const onEnter={...(s.onEnter??{}), rerollDelta:1};
  const body=[...(s.body??[])];
  const line='정보상이 식은 차 한 잔을 *건넨다*. 잠시 숨을 고르자 — 떨리던 손이 다시 안정을 찾는다. *[재굴림 +1]*';
  if(!body.some(b=>b.includes('재굴림 +1'))) body.push(line);
  await S.findOneAndUpdate({id:'omphalos_blackmarket'},{$set:{onEnter,body}});
  console.log('updated omphalos_blackmarket — onEnter.rerollDelta=1 + 본문');
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
