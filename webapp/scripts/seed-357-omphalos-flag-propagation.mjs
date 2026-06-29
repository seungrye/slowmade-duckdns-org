#!/usr/bin/env node
// scripts/seed-357-omphalos-flag-propagation.mjs — #357 옴팔로스 동맹 flag → 클라이맥스 전파.
//
// 비선형의 실체: "옴팔로스에서 누구와 손잡았는가"가 후반 도달 가능한 경로를 바꾼다.
//   - ally_sylvan(네오엘프 동맹)  → station_spirit_branch 에 conditional 추가.
//       영수의 죽음(spiritBeastDied) 이 없어도 sylvan 경로 해금 → 솔웬 외 주인공도 sylvan.
//       (단 climax_sylvan_path 는 "너의 종족=네오엘프" 전제라, 비-솔웬 친화 전용
//        climax_sylvan_allied 로 분기시켜 정체성 상충을 피한다.)
//   - ally_ironguard(아이언가드 동맹) → climax_revolution_path_derail/hijack 에 전용 분기.
//       붉은 천의 형제들이 합류하는 *강화된 혁명* 씬(climax_revolution_allied).
//   - knowsAscensionPlot(ally_spy 가 부여) → 기존 station_knowledge_branch 가 이미 수용
//       (harmony 해금). 추가 작업 불필요 — 자동 연결.
//
// idempotent — 신규 씬 upsert + conditional 추가/갱신.

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

const NEW_SCENES = [
  {
    id: 'climax_revolution_allied',
    title: 'Scene 08R-i — 강철의 형제들',
    body: [
      '열차의 운명이 너의 손에서 갈리는 순간, 객실 문이 *우레처럼* 열어젖혀진다. 막 모여든 망치꾼들 사이로 — 광장에서 네가 직접 손잡았던, *붉은 천을 팔에 묶은 형제들*이 선두로 밀려들어온다.',
      '"형제여! 약속대로 왔다!" 그들의 함성이 화차를 가득 메운다. 약속했던 *망치 천 자루*가, 혼자였다면 간신히 멈췄을 의식 열차를 이제 *완전히* 에워싼다.',
      '강철은 강철을 부른다. 광장에서의 선택 하나가 *외로운 저항*을 *혁명의 신호탄*으로 바꾸었다. 첨탑은 더 이상 너 혼자 마주할 벽이 아니다.',
    ],
    choices: [
      { kind: 'plain', id: 'storm_the_spire', label: '강철의 형제들과 함께 — 첨탑을 부순다.', to: 'ending_revolution' },
    ],
    onEnter: { stigmaDelta: 1 },
  },
  {
    id: 'climax_sylvan_allied',
    title: 'Scene 08S-i — 이끼가 부른 뿌리',
    body: [
      '네오엘프 밀정이 쥐여 준 마른 이끼가 손바닥에서 *불현듯 뜨거워진다*. 의식이 점화되려는 순간, 세계수의 뿌리가 땅 밑에서 거대하게 *몸부림*친다.',
      '너는 그녀가 일러 준 대로 이끼를 땅에 내려놓는다. 푸른 실핏줄 같은 뿌리가 이끼를 휘감고 — 열차의 발화기를 향해 *살아 있는 덩굴처럼* 뻗어 오른다.',
      '네 핏줄에 흐르는 것이 무엇이든, 숲은 *너를 통해* 대답했다. 강철도 마력도 아닌 — 가장 오래된 생명의 응답으로.',
    ],
    choices: [
      { kind: 'plain', id: 'become_root', label: '숲의 응답에 너를 맡긴다.', to: 'ending_sylvan_bond' },
    ],
    onEnter: { stigmaDelta: -2 },
  },
];

// conditional 추가/갱신 — sceneId 별. (to 가 다르면 갱신, 없으면 추가.)
const ADD_CHOICES = [
  {
    sceneId: 'station_spirit_branch',
    choice: {
      kind: 'conditional',
      id: 'sylvan_pact',
      label: '[이끼의 언약] 네오엘프 동맹의 인도로 — 세계수의 뿌리에 닿는다.',
      to: 'climax_sylvan_allied',
      condition: { kind: 'flag', key: 'ally_sylvan' },
      hidden: true,
    },
  },
  {
    sceneId: 'climax_revolution_path_derail',
    choice: {
      kind: 'conditional',
      id: 'iron_brothers',
      label: '[강철의 형제들] 붉은 천의 동맹이 망치를 들고 합류한다.',
      to: 'climax_revolution_allied',
      condition: { kind: 'flag', key: 'ally_ironguard' },
      hidden: true,
    },
  },
  {
    sceneId: 'climax_revolution_path_hijack',
    choice: {
      kind: 'conditional',
      id: 'iron_brothers',
      label: '[강철의 형제들] 붉은 천의 동맹이 망치를 들고 합류한다.',
      to: 'climax_revolution_allied',
      condition: { kind: 'flag', key: 'ally_ironguard' },
      hidden: true,
    },
  },
];

async function upsertScene(Scene, spec) {
  const cur = await Scene.findOne({ id: spec.id }).lean();
  const update = { ...spec, illustration: PLACEHOLDER };
  if (cur?.illustration && !cur.illustration.includes('placeholder')) update.illustration = cur.illustration;
  if (cur?.bodyOriginal) delete update.body;
  await Scene.findOneAndUpdate({ id: spec.id }, update, { upsert: true });
  console.log(`  upsert: ${spec.id}`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  for (const s of NEW_SCENES) await upsertScene(Scene, s);

  for (const { sceneId, choice } of ADD_CHOICES) {
    const cur = await Scene.findOne({ id: sceneId }).lean();
    if (!cur) { console.error(`✗ ${sceneId} 없음`); process.exit(1); }
    const choices = [...(cur.choices ?? [])];
    const idx = choices.findIndex((c) => c.id === choice.id);
    if (idx >= 0) {
      if (JSON.stringify(choices[idx]) === JSON.stringify(choice)) { console.log(`  skip: ${sceneId}/${choice.id} (동일)`); continue; }
      choices[idx] = choice; // to 등 갱신.
      await Scene.findOneAndUpdate({ id: sceneId }, { choices });
      console.log(`  update: ${sceneId}/${choice.id} → ${choice.to}`);
      continue;
    }
    if (choices.length >= 3) { console.error(`✗ ${sceneId} 선택지 초과 (${choices.length})`); process.exit(1); }
    choices.push(choice);
    await Scene.findOneAndUpdate({ id: sceneId }, { choices });
    console.log(`  add: ${sceneId}/${choice.id} → ${choice.to}`);
  }

  await mongoose.disconnect();
  console.log('✓ #357 옴팔로스 flag 전파 완료');
}

main().catch((e) => { console.error(e); process.exit(1); });
