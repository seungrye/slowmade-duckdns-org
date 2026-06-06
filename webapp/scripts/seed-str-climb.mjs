#!/usr/bin/env node
// #326 kael_cargo_container/climb_in plain → str 12 probability.
// 컨테이너 측면을 *완력으로 들어 올린다*. 실패 시 신규 우회 씬 + hpΔ-3.

import mongoose from 'mongoose';

const NEW_SCENE = {
  id: 'kael_cargo_climb_failed',
  title: 'Scene 03-fail — 미끄러진 손',
  illustration: '/web-adventure/scenes/placeholder-square.svg',
  body: [
    '컨테이너 측면이 *너의 손에서 빠져나간다*. 손바닥의 결정이 벗겨지며 *피와 푸른 가루*.',
    '그러나 무릎으로 다시 시도 — 결정의 *날카로움이* 컨테이너 가장자리를 *물어뜯는다*. 너는 가까스로 올라간다.',
    '거기서 아래로 — 추락만이 다음 단계.',
  ],
  choices: [
    { kind: 'plain', id: 'fall_anyway', label: '추락 — 어차피 옴팔로스 외곽으로 가는 길.', to: 'kael_falling' },
  ],
  onEnter: { hpDelta: -3, stigmaDelta: 3 },
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  // 1. 신규 씬 upsert.
  await Scene.findOneAndUpdate({ id: NEW_SCENE.id }, NEW_SCENE, { upsert: true, new: true });
  console.log('upsert:', NEW_SCENE.id);

  // 2. kael_cargo_container/climb_in plain → str probability.
  const cur = await Scene.findOne({ id: 'kael_cargo_container' }).lean();
  if (!cur) process.exit(1);
  const choices = cur.choices.map((c) => {
    if (c.id !== 'climb_in') return c;
    return {
      kind: 'probability',
      id: 'climb_in',
      label: '[완력] 컨테이너 측면을 *들어 올린다*.',
      stat: 'str',
      difficulty: 12,
      onSuccess: 'kael_falling',
      onFailure: 'kael_cargo_climb_failed',
      stigmaDeltaOnFailure: 2,
    };
  });
  await Scene.findOneAndUpdate({ id: 'kael_cargo_container' }, { choices });
  console.log('updated: kael_cargo_container/climb_in → str 12 probability');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
