#!/usr/bin/env node
// seed-360-kael-awakening.mjs — #359 각성 시스템 카엘 파일럿.
//
// 옴팔로스를 우회하는 독립 비선형 루트: kael_truth_revealed 에서 분기 →
//   연구자(베일 박사) 접촉 → 신뢰 → 진실·제어법 전수(+억제기) → 각성 게이트(복합 조건)
//   → 각성 절정 → 독립 클라이맥스 → 해방/찬탈 엔딩.
//
// 각성 게이트 = all 복합 조건(vale_trusted + learned_control + hasItem:stigma_suppressor
//   + stigmaAtLeast:70). 카엘 startStigma 80 이라 침식 조건은 자동 충족.
// 신뢰 실패·각성 보류 시 omphalos_outskirts(메인)로 복귀 — dead-end 방지.
//
// 본문은 희곡체(지문 *이탤릭* / **인물** "대사"). 엔딩 씬은 후일담 마커(— 시작) 보존.

import mongoose from 'mongoose';

const PH = '/web-adventure/scenes/placeholder-square.svg';

const NEW_SCENES = [
  {
    id: 'kael_vale_contact',
    title: 'Scene 04e — 사라진 연구자',
    body: [
      '*솔라리스 외곽, 버려진 관측소. 먼지와 녹 사이로 단 하나의 등불이 흔들린다.*',
      '너는 적하 일지 말미의 서명 — *베일 박사* — 을 좇아 여기까지 왔다. 사제단의 성흔 연구를 이끌다 흔적도 없이 사라진 자.',
      '**베일 박사** *(어둠 속에서 총을 겨눈 채)*',
      '"한 발짝만 더 오면 쏜다. …사제단이 보냈나? 아니면 — 너도 *버려진 것*인가."',
      '*그의 눈이 너의 손목, 푸르게 돋은 결정에 멈춘다.*',
    ],
    choices: [
      { kind: 'plain', id: 'claim_discarded', label: '손목을 내보인다 — 나도 폐기된 연료다.', to: 'kael_vale_trust' },
    ],
    onEnter: {},
  },
  {
    id: 'kael_vale_trust',
    title: 'Scene 04f — 의심의 저울',
    body: [
      '*베일 박사가 총을 내리지 않은 채, 너를 오래 살핀다.*',
      '**베일 박사**',
      '"버려진 자라… 그 말을 믿으라고? 사제단은 *연기까지* 잘 하지. 내가 아는 걸 넘기면, 너는 그걸 들고 날 팔아넘길지도 몰라."',
      '*거짓은 통하지 않는다. 그가 시험하는 것은 너의 진심이다.*',
    ],
    choices: [
      { kind: 'probability', id: 'earn_trust', label: '[진심] 네 분노와 두려움을 숨김없이 내보인다.', stat: 'cha', difficulty: 14, onSuccess: 'kael_vale_teaching', onFailure: 'kael_vale_distrust', stigmaDelta: 0 },
      // #359 회차 부메랑 — 이전 회차 해방(world.truth_freed)이면 베일이 이미 너를 알아본다.
      { kind: 'conditional', id: 'prior_truth', label: '[풀려난 진실] 지난 세계에서 이미 진실이 풀렸다 — 베일이 너를 알아본다.', to: 'kael_vale_teaching', condition: { kind: 'flag', key: 'world.truth_freed' }, hidden: true },
    ],
    onEnter: {},
  },
  {
    id: 'kael_vale_distrust',
    title: 'Scene 04f-fail — 닫힌 문',
    body: [
      '*너의 말은 그의 의심을 넘지 못했다.*',
      '**베일 박사** *(등을 돌리며)*',
      '"가라. 다음에 또 찾아오면 — 그땐 정말 쏜다."',
      '*문이 닫힌다. 각성의 길은 여기서 막혔다. 너는 다시 옴팔로스로 발길을 돌린다.*',
    ],
    choices: [
      { kind: 'plain', id: 'back_to_omphalos', label: '물러난다 — 외곽으로.', to: 'omphalos_outskirts' },
    ],
    onEnter: {},
  },
  {
    id: 'kael_vale_teaching',
    title: 'Scene 04g — 가면 아래의 학문',
    body: [
      '*베일 박사가 마침내 총을 내려놓는다. 그리고 오래 묵은 진실을 꺼낸다.*',
      '**베일 박사**',
      '"성흔은 여신의 축복이 아니야. 내가… 내가 세운 체계지. 세계수의 마력을 사람 몸에 *심어*, 결정이 익으면 거둔다. \'선택\'도 \'치료\'도 — 전부 가축을 얌전히 만드는 말이었어."',
      '*그가 룬이 새겨진 작은 장치를 너의 손에 쥐여 준다.*',
      '**베일 박사**',
      '"너는 발현하지 못한 채 버려진 몸이다. 하지만 — *억지로* 끌어낼 수는 있어. 이 억제기로 폭주를 붙들고, 침식을 *연료가 아니라 무기*로 돌리는 거다. 죽을 수도 있어. 그래도 하겠나?"',
    ],
    choices: [
      { kind: 'plain', id: 'prepare_awakening', label: '배운다 — 각성을 준비한다.', to: 'kael_awakening' },
    ],
    onEnter: { setFlags: { vale_trusted: true, learned_control: true, knowsStigmaTruth: true }, addItems: ['stigma_suppressor'] },
  },
  {
    id: 'kael_awakening',
    title: 'Scene 04h — 끌어올림',
    body: [
      '*억제기를 손에 쥔다. 베일이 일러 준 대로, 너는 잠든 마력을 *의지로* 끌어올린다.*',
      '*손목의 결정이 뜨겁게 달아오른다. 침식이 너의 한계를 시험한다 — 석화와 각성, 그 좁은 틈에서.*',
      '**베일 박사** *(낮게)*',
      '"버티는 거다. 너의 몫의 빛을, 이번엔 *네가* 쥐어라."',
    ],
    choices: [
      {
        kind: 'conditional', id: 'seize_the_surge', label: '[각성] 모든 것을 걸고 — 힘을 붙잡는다.',
        to: 'kael_awaken_surge',
        condition: { kind: 'all', conditions: [
          { kind: 'flag', key: 'vale_trusted' },
          { kind: 'flag', key: 'learned_control' },
          { kind: 'hasItem', itemId: 'stigma_suppressor' },
          { kind: 'stigmaAtLeast', min: 70 },
        ] },
      },
      { kind: 'plain', id: 'not_yet', label: '아직 이르다 — 물러난다.', to: 'omphalos_outskirts' },
    ],
    onEnter: {},
  },
  {
    id: 'kael_awaken_surge',
    title: 'Scene 04i — 깨어난 빛',
    body: [
      '*푸른 결정이 — 처음으로 — *너의 명령에 답한다*. 억제기가 폭주를 붙들고, 마력이 살갗 아래에서 *너의 것*으로 흐른다.*',
      '평생 너를 좀먹던 저주가, 이 순간 *무기*가 되었다. 선택받지 못한 자가 — 스스로 힘을 빚어냈다.',
      '**베일 박사** *(숨죽여)*',
      '"…됐어. 네가 해냈다. 이제 — 이 힘으로 무엇을 할 건가?"',
    ],
    choices: [
      { kind: 'plain', id: 'march_on', label: '나아간다.', to: 'kael_awaken_climax' },
    ],
    onEnter: { setFlags: { awakened: true } },
  },
  {
    id: 'kael_awaken_climax',
    title: 'Scene 04j — 두 갈래의 신',
    body: [
      '*각성한 힘이 너의 안에서 맥동한다. 베일이 너를 본다 — 두려움과 기대가 뒤섞인 눈으로.*',
      '*멀리 솔라리스의 첨탑이 빛난다. 그 아래 정제소에선 지금도 누군가 연료가 되고 있다.*',
      '너에게 두 길이 있다. 이 힘으로 *모두를 풀어줄* 것인가 — 아니면, 빈 신좌를 *네가 차지할* 것인가.',
    ],
    choices: [
      { kind: 'plain', id: 'choose_liberation', label: '[해방] 정제소를 부수고 진실을 외친다 — 모두를 깨운다.', to: 'ending_liberation' },
      { kind: 'plain', id: 'choose_usurpation', label: '[찬탈] 승천 의식을 가로챈다 — 내가 새 신이 된다.', to: 'ending_usurpation' },
      // #359 회차 부메랑 — 이전 회차 찬탈(world.false_god)이면 빈 신좌의 유혹이 더 짙다.
      { kind: 'conditional', id: 'false_god_echo', label: '[거짓 신의 메아리] 지난 세계의 찬탈자가 너를 부른다 — 신좌는 비어 있다.', to: 'ending_usurpation', condition: { kind: 'flag', key: 'world.false_god' }, hidden: true },
    ],
    onEnter: {},
  },
  {
    id: 'ending_liberation',
    title: '🔓 해방 — 깨어난 자들',
    body: [
      '*정제소의 벽이 무너진다. 갇혀 있던 자들이 빛 속으로 비틀거리며 걸어 나온다.*',
      '너는 외친다 — 성흔은 축복이 아니라고. 여신은 처음부터 없었다고. 사람들의 눈이, 처음으로, 두려움 대신 *분노*로 빛난다.',
      '— 선택받지 못한 자가, 선택받지 못한 모두를 깨웠다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'liberation',
    onEnter: {},
  },
  {
    id: 'ending_usurpation',
    title: '👁 찬탈 — 새로운 신',
    body: [
      '*승천의 빛이 너를 감싼다. 거둬들인 모든 마력이 — 이번엔 너의 것이다.*',
      '첨탑 정점, 여신의 빈 자리에 네가 앉는다. 발밑의 세계가 너를 우러른다. 폐기되었던 연료가 — 신이 되었다.',
      '— 그러나 너는 안다. 새 신앙의 첫 거짓말이, 바로 너라는 것을.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'usurpation',
    onEnter: {},
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  console.log('── 신규 씬 ──');
  for (const spec of NEW_SCENES) {
    const cur = await Scene.findOne({ id: spec.id }).lean();
    const update = { ...spec, illustration: PH };
    if (cur?.illustration && !cur.illustration.includes('placeholder')) update.illustration = cur.illustration;
    if (cur?.bodyProse) delete update.body; // 희곡 변환 보존(재실행 시).
    await Scene.findOneAndUpdate({ id: spec.id }, update, { upsert: true });
    console.log(`  upsert: ${spec.id}${spec.isEnding ? ' [엔딩 ' + spec.endingId + ']' : ''}`);
  }

  console.log('── 분기점 패치 (kael_truth_revealed) ──');
  {
    const cur = await Scene.findOne({ id: 'kael_truth_revealed' }).lean();
    if (!cur) { console.error('✗ kael_truth_revealed 없음'); process.exit(1); }
    const choices = [...(cur.choices ?? [])];
    if (!choices.some((c) => c.id === 'seek_researcher')) {
      if (choices.length >= 3) { console.error('✗ 선택지 초과'); process.exit(1); }
      choices.push({ kind: 'plain', id: 'seek_researcher', label: '[베일 박사] 사라진 연구자의 흔적을 좇는다 — 다른 길.', to: 'kael_vale_contact' });
      await Scene.findOneAndUpdate({ id: 'kael_truth_revealed' }, { choices });
      console.log('  add: kael_truth_revealed/seek_researcher → kael_vale_contact');
    } else {
      console.log('  skip: seek_researcher (이미 있음)');
    }
  }

  await mongoose.disconnect();
  console.log('✓ #360 카엘 각성 루트 완료');
}

main().catch((e) => { console.error(e); process.exit(1); });
