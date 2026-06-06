#!/usr/bin/env node
// scripts/seed-failure-bypass.mjs — #318 시나리오적 게임오버 직행 → HP/침식 패널티 후 우회.
//
// 디자인 의도 — 시나리오 ending (caught/chase) 은 *진짜 막다른 결정* 에만.
// 대부분의 RNG 실패는 *HP/침식 누적 데미지* 로 이어지고, 그 누적이 한계 도달하면
// 자동 fall/petrification ending.
//
// 변경:
//   1. 신규 우회 씬 4 종 (kael_struggled / kael_caught_minor / rin_pursued / rin_betrayal_aftermath).
//   2. 기존 probability 분기 11 곳의 onFailure → *_caught/_chase → 우회 씬으로.
//   3. 기존 *_caught / *_chase 씬은 reachable 0 → 운영 mongo 에서 *유지* (자동 trigger 대비
//      isFullyPetrified / isDead 자동 ending 이 우선). lint 의 ORPHAN 검사는 autoEndingSceneIds
//      에 추가하거나 우회 씬으로 reachable 유지.

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

const NEW_SCENES = [
  {
    id: 'kael_struggled',
    title: 'Scene 01-fail — 발각된 채로 도주',
    illustration: PLACEHOLDER,
    body: [
      '발각되었다. 군의관의 외침과 함께 경비병들이 쏟아져 나온다. 너는 가까스로 의무동 창문을 깨고 떨어진다.',
      '온몸의 푸른 결정이 충격에 따라 *균열*. 침식이 *깊숙이* 파고든다. 그러나 — 너는 살아 있다. 아직.',
      '복도의 어둠 속으로 비틀거리며 사라진다. 정제소로 가는 길은 닫혔지만, 화물 도크는 *아직 열려 있다*.',
    ],
    choices: [
      { kind: 'plain', id: 'to_corridor_injured', label: '복도 — 부상 상태로 이동.', to: 'kael_corridor' },
    ],
    onEnter: {
      hpDelta: -5,
      stigmaDelta: 10,
    },
  },
  {
    id: 'kael_caught_minor',
    title: 'Scene 02-fail — 가벼운 발각',
    illustration: PLACEHOLDER,
    body: [
      '시민증 단말기가 *붉은 경고음*. 위조가 들켰다. 너는 즉시 단말기를 부수고 도주.',
      '복도 한 쪽 벽을 *팔꿈치로 쳐서* 통과. 무릎의 결정이 쪼개지며 푸른 가루가 흩어진다.',
      '하지만 — 외형은 그대로다. 화물 도크는 아직 멀지 않다.',
    ],
    choices: [
      { kind: 'plain', id: 'to_corridor_after_id', label: '계속 — 다친 상태로 화물 도크로.', to: 'kael_cargo_container' },
    ],
    onEnter: {
      hpDelta: -3,
      stigmaDelta: 3,
    },
  },
  {
    id: 'rin_pursued',
    title: 'Scene 01-fail — 추적당함',
    illustration: PLACEHOLDER,
    body: [
      '경적 소리가 항구에 메아리친다. 너의 정체가 *공식 추격명령* 으로 등록되었다.',
      '뒷골목으로 달린다. 손목의 푸른 잔향이 추적자의 *마력 표식* 에 응답한다 — *이 도시에 너의 모든 발걸음이 새겨져 있다*.',
      '그러나 너는 도착했다. 증거의 본거지로. *늦었지만 — 가능*.',
    ],
    choices: [
      { kind: 'plain', id: 'to_evidence_pursued', label: '추적자 옆으로 — 증거 확보.', to: 'rin_evidence' },
    ],
    onEnter: {
      hpDelta: -5,
      stigmaDelta: 5,
    },
  },
  {
    id: 'rin_betrayal_aftermath',
    title: 'Scene 03-fail — 배신의 끝자락',
    illustration: PLACEHOLDER,
    body: [
      '호프만 수사관장의 권총이 발사되었다. 가슴에 *뜨거운 충격*. 그러나 너는 살아 있다 — *방탄 휘장* 이 너의 운명을 한 번 빚어줬다.',
      '문 밖으로 비틀거리며 빠져나간다. 본부의 비밀 통로 — 너만이 안다. 거기 *아이언가드 연락책* 이 기다리고 있다.',
      '피로 물든 휘장이 너의 외투 안주머니에 무겁게 남는다.',
    ],
    choices: [
      { kind: 'plain', id: 'to_underground_wounded', label: '지하 — 큰 부상으로 잠적.', to: 'rin_underground' },
    ],
    onEnter: {
      hpDelta: -10,
      stigmaDelta: 10,
    },
  },
];

// onFailure 재지정 — 기존 *_caught / *_chase 직행 → 신규 우회 씬.
const FAILURE_REDIRECTS = [
  // Kael
  { sceneId: 'kael_infirmary', choiceId: 'grab_scalpel', newFailure: 'kael_struggled' },
  { sceneId: 'kael_infirmary', choiceId: 'overload_panel', newFailure: 'kael_struggled' },
  { sceneId: 'kael_infirmary', choiceId: 'fake_flatline', newFailure: 'kael_struggled' },
  { sceneId: 'kael_corridor', choiceId: 'forge_id', newFailure: 'kael_caught_minor' },
  // Rin
  { sceneId: 'rin_harbor', choiceId: 'shoot_lock', newFailure: 'rin_pursued' },
  { sceneId: 'rin_harbor', choiceId: 'sneak_closer', newFailure: 'rin_pursued' },
  { sceneId: 'rin_harbor', choiceId: 'badge_arrest', newFailure: 'rin_pursued' },
  { sceneId: 'rin_betrayal', choiceId: 'shoot_first', newFailure: 'rin_betrayal_aftermath' },
  { sceneId: 'rin_betrayal', choiceId: 'talk_down', newFailure: 'rin_betrayal_aftermath' },
  { sceneId: 'rin_betrayal', choiceId: 'window_escape', newFailure: 'rin_betrayal_aftermath' },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // 1. 신규 씬 upsert.
  for (const scene of NEW_SCENES) {
    await Scene.findOneAndUpdate({ id: scene.id }, scene, { upsert: true, new: true });
    console.log('upsert:', scene.id, `(hpΔ${scene.onEnter.hpDelta}, stigmaΔ+${scene.onEnter.stigmaDelta})`);
  }

  // 2. onFailure 재지정.
  for (const r of FAILURE_REDIRECTS) {
    const cur = await Scene.findOne({ id: r.sceneId }).lean();
    if (!cur) { console.log('없음:', r.sceneId); continue; }
    const choices = cur.choices.map((c) =>
      c.id === r.choiceId ? { ...c, onFailure: r.newFailure } : c
    );
    await Scene.findOneAndUpdate({ id: r.sceneId }, { choices });
    console.log('redirect:', r.sceneId, '/', r.choiceId, '→', r.newFailure);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
