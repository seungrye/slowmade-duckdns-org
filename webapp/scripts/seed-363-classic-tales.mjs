#!/usr/bin/env node
// scripts/seed-363-classic-tales.mjs — 고전 삽화(揷話) 이벤트 4편, 12씬.
//
// 퍼블릭 도메인 고전의 모티프를 〈에테르니아〉 세계관으로 각색한 곁가지 이벤트.
// 각 이벤트는 기존 1지선다 씬에 우회로(choice)를 추가하고, 결말은 원래 목적지로
// 합류한다(그래프 불변 — 엔딩·본편 분기 무영향). 서식은 FORMAT.md 규약.
//
//   지킬과 하이드  → 카엘 Scene 02c  잠긴 조제실 (kael_corridor_clear 분기)
//   파우스트       → 카엘 Scene 03b  어둠 속의 거래 (kael_cargo_container 분기)
//   오디세이아     → 린   Scene 03c  수로의 노래 (rin_underground_* 3변형 분기)
//   돈키호테       → 솔웬 Scene 04b  풍차의 거인 (solwen_departure 분기)
//
// 보상 아이템 4종은 src/content/web-adventure/items.ts 에 등재(mutagen_serum,
// faust_pact, old_knight_lance, siren_scale).

import mongoose from 'mongoose';

const PLACEHOLDER_ILLUSTRATION = '/web-adventure/scenes/placeholder-square.svg';

const scenes = [
  // ── 지킬과 하이드 — 잠긴 조제실 ─────────────────────────────────────
  {
    id: 'tale_serum_lab',
    title: 'Scene 02c — 잠긴 조제실',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '*위조 통행증이 통했다. 도크로 향하는 복도 — 반쯤 열린 조제실 문틈으로 푸른 가스등 빛이 샌다.*',
      '약품 선반 사이, 실험대 하나가 눈에 들어온다. 흘려 쓴 연구 일지 위에 검붉은 병이 놓여 있다. 라벨에는 [[변성 혈청]] — 그리고 경고 대신, 누군가의 손글씨.',
      '*일지의 마지막 줄이 눈에 박힌다.*',
      '"인간은 하나가 아니다. 둘이다. 혈청은 다만 문을 열 뿐이다."',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'drink_serum',
        label: '[체력] 병을 비운다 — 몸이 견뎌 주기를.',
        stat: 'con',
        difficulty: 11,
        onSuccess: 'tale_serum_power',
        onFailure: 'tale_serum_bad',
      },
      {
        kind: 'plain',
        id: 'leave_serum',
        label: '손대지 않는다. 지금 필요한 건 힘이 아니라 시간이다.',
        to: 'kael_cargo_container',
      },
    ],
  },
  {
    id: 'tale_serum_power',
    title: 'Scene 02c-i — 다른 존재',
    illustration: PLACEHOLDER_ILLUSTRATION,
    onEnter: { addItems: ['mutagen_serum'], stigmaDelta: 4 },
    body: [
      '*목구멍을 태우며 내려간 액체가, 심장에서 다시 올라온다.*',
      '어깨가 벌어지고 손아귀에 낯선 악력이 감긴다. 유리 진열장에 비친 네 눈빛이 — 잠깐, 네 것이 아니다.',
      '팔의 푸른 결정이 한 뼘 자라 있다. 힘에는 값이 있다. 일지의 문장이 이제야 이해된다: 문은 열렸고, 문 너머의 것도 너를 보았다.',
    ],
    choices: [
      { kind: 'plain', id: 'serum_go', label: '옷깃을 여미고 도크로 향한다.', to: 'kael_cargo_container' },
    ],
  },
  {
    id: 'tale_serum_bad',
    title: 'Scene 02c-ii — 열리지 않은 문',
    illustration: PLACEHOLDER_ILLUSTRATION,
    onEnter: { stigmaDelta: 8, hpDelta: -2 },
    body: [
      '*식도가 뒤집히는 경련. 너는 실험대 모서리를 붙잡고 무너진다.*',
      '몸이 혈청을 거부한다 — 아니, 혈청이 네 안의 무언가와 싸운다. 팔의 결정이 벌겋게 달아오르며 지지직 소리를 낸다.',
      '한참 만에 구역질이 멎는다. 얻은 것은 없고, 침식만 한 겹 깊어졌다. 일지는 처음부터 경고였다.',
    ],
    choices: [
      { kind: 'plain', id: 'serum_fail_go', label: '벽을 짚고 일어나, 도크로 향한다.', to: 'kael_cargo_container' },
    ],
  },

  // ── 파우스트 — 어둠 속의 거래 ───────────────────────────────────────
  {
    id: 'tale_pact_voice',
    title: 'Scene 03b — 어둠 속의 거래',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '*가솔린 액면이 출렁이는 컨테이너의 어둠. 구석에서 마른 손이 모닥불도 없이 데워지고 있다.*',
      '**잿빛 학자** *(어둠 속에서도 또렷한 목소리로)*',
      '"떨어질 걸 알면서 뛰어드는 자를 오랜만에 보는군. 거래를 하지. 네 운명의 주사위를 다시 굴릴 권리 — 값은 네 몸의 푸른 결정이 조금 더 자라는 것. 그뿐이야."',
      '그의 무릎 위에 [[잿빛 계약서]]가 펼쳐져 있다. 서명란에는 이미 네 필체의 이름이 적혀 있다.',
    ],
    choices: [
      { kind: 'plain', id: 'sign_pact', label: '서명한다 — 살아남는 것이 먼저다.', to: 'tale_pact_sealed' },
      { kind: 'plain', id: 'refuse_pact', label: '거절한다 — 내 운명은 내 손으로 굴린다.', to: 'tale_pact_refused' },
    ],
  },
  {
    id: 'tale_pact_sealed',
    title: 'Scene 03b-i — 서명',
    illustration: PLACEHOLDER_ILLUSTRATION,
    onEnter: { addItems: ['faust_pact'], rerollDelta: 2, stigmaDelta: 10 },
    body: [
      '*펜을 쥔 기억이 없는데, 서명은 끝나 있다.*',
      '학자가 계약서를 말아 쥐자 양피지가 재처럼 부서져 네 외투 주머니로 스민다. 손끝에서 낯선 행운이 지릿하게 감돈다 — 그리고 팔의 결정이, 소리 없이 자란다.',
      '**잿빛 학자** *(이미 절반쯤 어둠에 녹아들며)*',
      '"현명한 선택이야. 때가 되면 — 값을 받으러 오지."',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'pact_close_lid',
        label: '[체력] 뚜껑을 다시 팔 힘으로 폐쇄 — 액체 위에 매달린다.',
        stat: 'con',
        difficulty: 12,
        onSuccess: 'kael_falling',
        onFailure: 'kael_cargo_climb_failed',
      },
    ],
  },
  {
    id: 'tale_pact_refused',
    title: 'Scene 03b-ii — 빈 어둠',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '*거절의 말이 컨테이너 벽에 부딪혀 돌아온다. 학자는 화내지 않는다.*',
      '**잿빛 학자** *(마른 웃음과 함께 어둠으로 물러나며)*',
      '"좋아, 그 눈빛. 하지만 기억해 두게 — 대부분은 두 번째 물음에 서명하지. 언젠가 다시 묻겠네."',
      '눈을 깜빡이자 구석에는 아무도 없다. 출렁이는 가솔린과, 닫아야 할 뚜껑만 남아 있다.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'refuse_close_lid',
        label: '[체력] 뚜껑을 다시 팔 힘으로 폐쇄 — 액체 위에 매달린다.',
        stat: 'con',
        difficulty: 12,
        onSuccess: 'kael_falling',
        onFailure: 'kael_cargo_climb_failed',
      },
    ],
  },

  // ── 오디세이아 — 수로의 노래 ────────────────────────────────────────
  {
    id: 'tale_siren_song',
    title: 'Scene 03c — 수로의 노래',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '*지하수로. 검은 물이 무릎까지 차오르고, 어디선가 — 노랫소리.*',
      '말이 아니라 기억으로 파고드는 선율이다. 네가 잃어버린 것들의 목소리로 노래한다. 물살 저편, [[가라앉은 부두]] 쪽에서 희끗한 형체가 물결처럼 흔들린다.',
      '수사관의 머릿속에 항만 실종 사건 서류가 스친다 — 지난겨울에만 열일곱. 시신은 단 한 구도 없었다.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'face_song',
        label: '[지혜] 노래를 정면으로 마주한다 — 수사관의 눈으로.',
        stat: 'wis',
        difficulty: 12,
        onSuccess: 'tale_siren_resist',
        onFailure: 'tale_siren_lured',
      },
      { kind: 'plain', id: 'block_ears', label: '외투 자락을 찢어 귀를 틀어막고 수로를 벗어난다.', to: 'rin_underground' },
    ],
  },
  {
    id: 'tale_siren_resist',
    title: 'Scene 03c-i — 끊긴 선율',
    illustration: PLACEHOLDER_ILLUSTRATION,
    onEnter: { addItems: ['siren_scale'] },
    body: [
      '*너는 걸음을 멈추지 않은 채, 노래를 사건 기록처럼 한 소절씩 뜯어 듣는다.*',
      '그리움의 형식, 사냥의 내용. 선율이 네 안에서 발 디딜 곳을 찾지 못하고 무너진다. 물속의 형체가 처음으로 — 침묵한다.',
      '물러나는 물결 위에 무지갯빛 [[세이렌의 비늘]] 하나가 남는다. 열일곱 명의 실종자 파일에, 오늘 처음으로 물증이 생겼다.',
    ],
    choices: [
      { kind: 'plain', id: 'take_scale', label: '비늘을 증거 주머니에 넣고, 지하로 향한다.', to: 'rin_underground' },
    ],
  },
  {
    id: 'tale_siren_lured',
    title: 'Scene 03c-ii — 물의 문턱',
    illustration: PLACEHOLDER_ILLUSTRATION,
    onEnter: { hpDelta: -3, stigmaDelta: 5 },
    body: [
      '*정신이 들었을 때, 물은 이미 가슴까지 차 있다.*',
      '언제 걸어 들어갔는지 기억이 없다. 노래가 멎은 자리에 웃음 비슷한 파문만 번진다 — 놓친 것이 아니라, 놓아준 것이다.',
      '너는 이를 악물고 물을 거슬러 나온다. 젖은 외투가 납처럼 무겁고, 팔의 결정이 물때처럼 번져 있다.',
    ],
    choices: [
      { kind: 'plain', id: 'crawl_out', label: '젖은 몸을 끌고, 지하로 향한다.', to: 'rin_underground' },
    ],
  },

  // ── 돈키호테 — 풍차의 거인 ──────────────────────────────────────────
  {
    id: 'tale_windmill_knight',
    title: 'Scene 04b — 풍차의 거인',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '*숲을 등진 가도. 언덕 위에서 [[에테르 풍차탑]] 세 기가 느리게 돌고 있다.*',
      '그 아래, 녹슨 갑옷의 노기사가 흠집투성이 랜스를 겨눈 채 서 있다. 투구 틈으로 흰 수염이 바람에 날린다.',
      '**노기사** *(풍차를 노려보며, 우렁차게)*',
      '"보아라, 종자여! 팔이 넷 달린 거인들이 대지의 마력을 훔치고 있다. 나 홀로라도 저 폭군들을 벌하리라!"',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'play_squire',
        label: '[카리스마] 종자를 자처하며 장단을 맞춘다.',
        stat: 'cha',
        difficulty: 11,
        onSuccess: 'tale_knight_bond',
        onFailure: 'tale_knight_fiasco',
      },
      { kind: 'plain', id: 'pass_knight', label: '노인을 지나쳐 간다 — 옴팔로스는 멀다.', to: 'omphalos_outskirts' },
    ],
  },
  {
    id: 'tale_knight_bond',
    title: 'Scene 04b-i — 거인 사냥',
    illustration: PLACEHOLDER_ILLUSTRATION,
    onEnter: { addItems: ['old_knight_lance'] },
    body: [
      '*"거인의 약점은 옆구리입니다, 기사님." 너의 한마디에 노기사의 눈이 형형하게 빛난다.*',
      '둘이서 언덕을 "돌격"한다. 랜스가 풍차 날개를 스치고, 노기사는 반동에 나뒹굴면서도 크게 웃는다 — 거인이 물러났다는 것이다.',
      '**노기사** *(투구를 벗고, 문득 맑아진 눈으로)*',
      '"…거인이 아니었을지도 모르지. 허나 함께 싸워 준 이는 진짜였네. 받게 — 이 늙은이보다는 그대에게 어울려."',
    ],
    choices: [
      { kind: 'plain', id: 'take_lance', label: '[[노기사의 랜스]]를 받아 들고, 가던 길을 간다.', to: 'omphalos_outskirts' },
    ],
  },
  {
    id: 'tale_knight_fiasco',
    title: 'Scene 04b-ii — 부러진 창끝',
    illustration: PLACEHOLDER_ILLUSTRATION,
    onEnter: { hpDelta: -2 },
    body: [
      '*어설픈 맞장구가 오히려 불을 붙였다. 노기사가 홀로 언덕을 내달린다.*',
      '랜스 끝이 풍차 날개에 걸려 노기사가 허공을 한 바퀴 돌고, 말리러 뛰어든 너까지 흙바닥에 나뒹군다. 갈비뼈가 욱신거린다.',
      '**노기사** *(흙투성이로 벌렁 누운 채, 껄껄 웃으며)*',
      '"오늘도 거인이 이겼군! 허나 기사는 넘어진 횟수로 완성되는 법 — 그대도 오늘 하나를 쌓았네."',
    ],
    choices: [
      { kind: 'plain', id: 'help_knight_up', label: '노기사를 부축해 세우고, 가던 길을 간다.', to: 'omphalos_outskirts' },
    ],
  },
];

// 기존 씬에 우회로 choice 를 멱등 추가(choice id 존재 시 skip). 각 이벤트의 진입점.
const hooks = [
  { sceneId: 'kael_corridor_clear',
    choice: { kind: 'plain', id: 'tale_serum_hook', label: '반쯤 열린 조제실 문틈으로 — 푸른 빛이 샌다.', to: 'tale_serum_lab' } },
  { sceneId: 'kael_cargo_container',
    choice: { kind: 'plain', id: 'tale_pact_hook', label: '어둠 속 사람의 기척 — 낮은 목소리에 귀를 기울인다.', to: 'tale_pact_voice' } },
  { sceneId: 'rin_underground_shot',
    choice: { kind: 'plain', id: 'tale_siren_hook', label: '수로 저편에서 희미한 노랫소리가 들려온다.', to: 'tale_siren_song' } },
  { sceneId: 'rin_underground_talk',
    choice: { kind: 'plain', id: 'tale_siren_hook', label: '수로 저편에서 희미한 노랫소리가 들려온다.', to: 'tale_siren_song' } },
  { sceneId: 'rin_underground_window',
    choice: { kind: 'plain', id: 'tale_siren_hook', label: '수로 저편에서 희미한 노랫소리가 들려온다.', to: 'tale_siren_song' } },
  { sceneId: 'solwen_departure',
    choice: { kind: 'plain', id: 'tale_knight_hook', label: '가도 언덕의 [[에테르 풍차탑]] 아래 — 고함치는 노인이 보인다.', to: 'tale_windmill_knight' } },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'WebAdventureScene',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );

  // 멱등 — upsert by id (placeholder 가 아닌 illustration 은 보존).
  for (const s of scenes) {
    const cur = await Scene.findOne({ id: s.id }).lean();
    const update = { ...s };
    if (cur && cur.illustration && !cur.illustration.includes('placeholder')) {
      update.illustration = cur.illustration;
    }
    await Scene.findOneAndUpdate({ id: s.id }, update, {
      upsert: true, new: true, setDefaultsOnInsert: true,
    });
    console.log('upsert:', s.id);
  }

  // 우회로 choice 멱등 push (choices ≤3 유지 — 대상은 전부 1지선다 씬).
  for (const { sceneId, choice } of hooks) {
    const cur = await Scene.findOne({ id: sceneId }).lean();
    if (!cur) { console.log('⚠ hook 대상 없음:', sceneId); continue; }
    if ((cur.choices || []).some((c) => c.id === choice.id)) {
      console.log('hook 이미 있음:', sceneId);
      continue;
    }
    if ((cur.choices || []).length >= 3) { console.log('⚠ choices 초과, skip:', sceneId); continue; }
    await Scene.updateOne({ id: sceneId }, { $push: { choices: choice } });
    console.log('hook 추가:', sceneId, '→', choice.to);
  }

  console.log(`총 ${scenes.length} 씬 + ${hooks.length} 우회로 적치`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
