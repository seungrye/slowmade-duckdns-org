#!/usr/bin/env node
// scripts/seed-354-reroll-boost.mjs — 재굴림 +1 보충 이벤트 (주인공 무관 공통).
// omphalos_blackmarket(선택적 공통 씬, 모든 주인공 진입 가능) 진입 시 재굴림 +1.
// onEnter.rerollDelta=1 + 본문 한 줄. 멱등(중복 방지).
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
