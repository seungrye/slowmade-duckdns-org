#!/usr/bin/env node
// scripts/seed-story-flow-balance.mjs - #284's story-flow balance fix.
//
// A. evening out the act 1 opening bodies (Kael's 6 lines against Rin's 3 and Solwen's 3):
//    rin_harbor: +2 lines (the smuggling, the contamination's traces)
//    solwen_grove: +2 lines (the spirit beast's breathing, the magic residue on the palm)
//
// B. environmental contamination added to Kael's act 1 line (strengthening the time-limit tone of 80):
//    kael_corridor: stigma +1 (close to the refinery, more magic leaking)
//    kael_cargo_container: stigma +1 (the petrol drum sits next to refined mana-stone crystals)
//    kael_falling: stigma +1 (the fall strains the body)

import mongoose from 'mongoose';

const bodyAdds = {
  rin_harbor: [
    '항구 가스등이 깜빡인다. 너의 손목에 새겨진 *수사관 휘장* 의 은빛 위로 — 푸른 잔향 한 줄. 너도 *그 병* 의 초기 단계다. 본부엔 알리지 않았다.',
    '아이언가드의 첩보망과 사제단의 비밀 사이 — *너의 칼날 같은 정직* 이 오늘 밤 시험받는다.',
  ],
  solwen_grove: [
    '너의 손바닥 안쪽에 *옅은 마력 흔적* — 영수의 호흡과 *공명* 하는 푸른 자취. 영수 가문의 마지막 옥수만이 갖는 인장.',
    '나뭇잎의 그림자 한 잎이 너의 발 옆에 떨어진다. 영수의 *작별의 신호*. 너는 이 순간이 마지막 어느 누군가의 *추도* 임을 안다.',
  ],
};

const envStigma = {
  kael_corridor: 1,
  kael_cargo_container: 1,
  kael_falling: 1,
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // A. adding to the bodies
  for (const [id, lines] of Object.entries(bodyAdds)) {
    const cur = await Scene.findOne({ id }).lean();
    if (!cur) { console.log('없음:', id); continue; }
    const body = [...(cur.body ?? [])];
    let added = 0;
    for (const line of lines) {
      if (!body.includes(line)) { body.push(line); added++; }
    }
    if (added === 0) { console.log('skip (이미 추가):', id); continue; }
    await Scene.findOneAndUpdate({ id }, { body });
    console.log('updated body:', id, `(${body.length} 줄)`);
  }

  // B. adding the environmental contamination
  for (const [id, delta] of Object.entries(envStigma)) {
    const cur = await Scene.findOne({ id }).lean();
    if (!cur) { console.log('없음:', id); continue; }
    const onEnter = { ...(cur.onEnter ?? {}), stigmaDelta: delta };
    await Scene.findOneAndUpdate({ id }, { onEnter });
    console.log('updated env stigma:', id, `+${delta}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
