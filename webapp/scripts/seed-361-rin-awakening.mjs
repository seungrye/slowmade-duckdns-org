#!/usr/bin/env node
// seed-361-rin-awakening.mjs — #361 각성 시스템 린 루트(신념과 타락).
//
// 분기점: rin_underground → 베일 박사 추적(각성 루트, 옴팔로스 우회).
// 2 축: 신념(진실 폭로) vs 타락(제국 고위층). 침식 초기(10)라 각성하려면
//   스스로 침식을 끌어올리는 대가(자발적). 결말:
//   - 신념+각성해방 → liberation(공유)   - 타락+각성 → regency(신규)
//   - 타살死(추적 발각/권좌 암살) → purge(신규)
//   - 받아들이고 떠남 → wayfarer(신규)    - 침식死 → petrification(자동)
//
// 회차 부메랑: world.regent_rules / world.purged / world.wanderer → 각 conditional 분기.
// 본문 희곡체(지문 *이탤릭* / **인물** "대사"). 엔딩 씬은 후일담 마커(— 시작).

import mongoose from 'mongoose';

const PH = '/web-adventure/scenes/placeholder-square.svg';

const NEW_SCENES = [
  {
    id: 'rin_vale_pursuit',
    title: 'Scene R-04e — 흔적을 좇아',
    body: [
      '*광산 지대의 폐기록 보관소. 먼지 낀 장부 사이로, 너는 수사관의 눈으로 한 이름을 끄집어낸다.*',
      '사제단 성흔 연구의 책임자 — *베일 박사*. 그의 마지막 행적이 이 지하 어딘가로 이어진다.',
      '*추적은 너의 본능이다. 그러나 이번엔 — 쫓는 자가 곧 쫓기는 자이기도 하다.*',
    ],
    choices: [
      { kind: 'plain', id: 'follow_trail', label: '흔적을 따라 — 더 깊은 지하로.', to: 'rin_vale_contact' },
      // #361 회차 부메랑 — 이전 숙청(world.purged)된 자의 기록이 추적을 단축한다.
      { kind: 'conditional', id: 'purged_trace', label: '[지워진 이름] 지난 세계에서 숙청된 자의 기록이 — 길을 가리킨다.', to: 'rin_vale_contact', condition: { kind: 'flag', key: 'world.purged' }, hidden: true },
    ],
    onEnter: {},
  },
  {
    id: 'rin_vale_contact',
    title: 'Scene R-04f — 쫓는 자, 쫓기는 자',
    body: [
      '*어두운 작업장. 너의 발소리를 들은 그림자가 — 먼저 움직인다.*',
      '**베일 박사** *(총을 겨눈 채)*',
      '"아이언가드 수사관… 휘장이 보이는군. 사제단이 못 잡은 걸 네가 잡으러 왔나? 아니면 — 너도 *그 병*을 앓고 있나."',
      '*그의 시선이 너의 손목, 막 돋기 시작한 푸른 결정에 멈춘다. 한 번의 오판이 — 너를 끝낼 수도 있다.*',
    ],
    choices: [
      { kind: 'probability', id: 'approach_slow', label: '[침착] 휘장을 내리고 천천히 다가간다.', stat: 'cha', difficulty: 13, onSuccess: 'rin_crossroads', onFailure: 'rin_vale_caught', stigmaDelta: 0 },
    ],
    onEnter: {},
  },
  {
    id: 'rin_vale_caught',
    title: 'Scene R-04f-fail — 그림자에 들키다',
    body: [
      '*베일에게 닿기 전, 너의 추적이 다른 눈에 먼저 걸렸다. 백은 가면의 사제단이 골목 양끝을 막는다.*',
      '**사제단 사자**',
      '"수사관. 너무 멀리 왔어. 네 휘장도, 네 결정도 — 이제 우리 것이다."',
      '*끌려가는 너의 등 뒤로, 관측소의 등불이 꺼진다.*',
    ],
    choices: [
      { kind: 'plain', id: 'dragged_away', label: '끌려간다.', to: 'ending_purge' },
    ],
    onEnter: { stigmaDelta: 4, hpDelta: -4 },
  },
  {
    id: 'rin_crossroads',
    title: 'Scene R-04g — 신념과 타락',
    body: [
      '*베일이 총을 내린다. 그러나 그 순간, 작업장 문이 열리고 — 낯익은 얼굴이 들어선다. 제국의 *밀사*.*',
      '**제국 밀사** *(미소를 띠며)*',
      '"린 수사관. 본부는 너를 배신자로 적었지만 — 윗선은 다르게 본다. 네 *재능*과 네 *침식*, 둘 다 쓸모가 있지. 고위층 자리와 — *치료*. 어떤가?"',
      '*베일이 너를 본다. 한쪽엔 진실, 한쪽엔 살아남을 권력. 칼날 같던 너의 정직이 — 처음으로 흔들린다.*',
    ],
    choices: [
      { kind: 'plain', id: 'keep_faith', label: '[신념] 진실을 택한다 — 밀사를 등진다.', to: 'rin_creed_teaching' },
      { kind: 'plain', id: 'take_deal', label: '[타락] 제국의 손을 잡는다.', to: 'rin_fall_deal' },
      // #361 회차 부메랑 — 이전 권좌(world.regent_rules)의 그림자가 길을 이미 안다.
      { kind: 'conditional', id: 'regent_echo', label: '[낯익은 그림자] 지난 세계의 타락자가 이미 이 자리를 안다 — 그 길로.', to: 'rin_fall_deal', condition: { kind: 'flag', key: 'world.regent_rules' }, hidden: true },
    ],
    onEnter: {},
  },
  {
    id: 'rin_creed_teaching',
    title: 'Scene R-04h — 가르침',
    body: [
      '*밀사가 떠난 자리, 베일이 마침내 입을 연다.*',
      '**베일 박사**',
      '"진실을 택했군. 어리석지만 — 드물지. 들어라. 성흔은 여신의 것이 아니야. *내가* 세운 체계다. 세계수 마력을 사람 몸에 심어, 익으면 거둔다. \'선택\'도 \'치료\'도 — 가축을 얌전히 만드는 말이었어."',
      '*그가 룬이 새겨진 장치를 너의 손에 쥐여 준다.*',
      '**베일 박사**',
      '"너는 아직 초기다. 살 수 있어. 하지만 *각성*하려면 — 스스로 침식을 *끌어올려야* 한다. 정의를 위해 너 자신을 *태우는* 거지. 각오됐나?"',
    ],
    choices: [
      { kind: 'plain', id: 'embrace_pyre', label: '배운다 — 나를 태울 각오를 한다.', to: 'rin_creed_pyre' },
    ],
    onEnter: { setFlags: { vale_trusted: true, learned_control: true, knowsStigmaTruth: true }, addItems: ['stigma_suppressor'] },
  },
  {
    id: 'rin_creed_pyre',
    title: 'Scene R-04i — 스스로를 태우다',
    body: [
      '*너는 억제기를 쥐고, 잠든 마력을 *억지로* 끌어올린다. 손목의 결정이 맹렬히 번진다 — 초기였던 침식이, 단숨에 깊어진다.*',
      '살 수 있었던 몸을, 너는 *진실을 위해* 연료로 던진다.',
      '**베일 박사** *(조용히)*',
      '"…돌이킬 수 없다. 버텨라, 수사관."',
    ],
    choices: [
      {
        kind: 'conditional', id: 'seize_awakening', label: '[각성] 모든 것을 걸고 — 불 속으로.',
        to: 'rin_creed_surge',
        condition: { kind: 'all', conditions: [
          { kind: 'flag', key: 'vale_trusted' },
          { kind: 'flag', key: 'learned_control' },
          { kind: 'hasItem', itemId: 'stigma_suppressor' },
          { kind: 'stigmaAtLeast', min: 70 },
        ] },
      },
      { kind: 'plain', id: 'turn_back', label: '두렵다 — 등을 돌린다.', to: 'rin_wayfarer' },
    ],
    onEnter: { stigmaDelta: 60 },
  },
  {
    id: 'rin_creed_surge',
    title: 'Scene R-04j — 불에서 살아남다',
    body: [
      '*침식이 한계를 넘어 역류한다. 억제기가 폭주를 붙들고 — 그 순간, 푸른 결정이 *너의 의지에 답한다*. 죽음의 문턱에서, 너는 살아 돌아온다.*',
      '침식은 멈췄다. 아니 — *길들여졌다*. 정의를 위해 스스로를 태운 자가, 그 불에서 *새 힘*을 얻었다.',
      '**베일 박사**',
      '"해냈어… 선택받지 못한 자가, 스스로 깨어났다. 이제 — 이 진실을 세상에 던져라."',
    ],
    choices: [
      { kind: 'plain', id: 'cast_the_truth', label: '진실을 세상에 던진다.', to: 'ending_liberation' },
    ],
    onEnter: { setFlags: { awakened: true }, stigmaDelta: -40 },
  },
  {
    id: 'rin_fall_deal',
    title: 'Scene R-04h2 — 거래',
    body: [
      '*너는 밀사의 손을 잡는다. 베일이 경멸의 눈으로 너를 보더니 — 곧, 등을 돌려 어둠으로 사라진다.*',
      '**제국 밀사**',
      '"현명해. 고위층은 침식을 *멈추는 법*을 알지. 네 결정은 이제 저주가 아니라 — *자격*이다."',
      '*너는 쫓기는 자에서 거두는 자가 된다. 옛 휘장의 무게가 어깨에서 스르륵 떨어진다.*',
    ],
    choices: [
      { kind: 'plain', id: 'to_throne', label: '권좌로 — 위로 오른다.', to: 'rin_fall_throne' },
    ],
    onEnter: { setFlags: { empire_pact: true } },
  },
  {
    id: 'rin_fall_throne',
    title: 'Scene R-04i2 — 권좌의 칼날',
    body: [
      '*제국의 고위층. 침식은 그들의 손에서 *치료*된다 — 실은, 너의 각성을 거두어 길들이는 것.*',
      '너는 권력을 얻었다. 그러나 권좌엔 늘 *다른 칼*이 따라온다 — 아이언가드 잔당, 경쟁하는 사제, 등을 노리는 부하.',
      '**제국 밀사** *(낮게)*',
      '"위로 오를수록 등은 넓어지지. 경쟁자를 — *먼저* 치겠나?"',
    ],
    choices: [
      { kind: 'probability', id: 'secure_power', label: '[정치] 권력을 굳힌다 — 경쟁자를 먼저 제거한다.', stat: 'int', difficulty: 15, onSuccess: 'ending_regency', onFailure: 'ending_purge', stigmaDelta: 0 },
      { kind: 'plain', id: 'doubt_pull_out', label: '의심이 든다 — 발을 뺀다.', to: 'rin_wayfarer' },
      // #361 회차 부메랑 — 이전 여로(world.wanderer)의 소문이 너를 부른다.
      { kind: 'conditional', id: 'wanderer_echo', label: '[떠도는 소문] 지난 세계의 여행자가 손짓한다 — 너도 떠날 수 있다.', to: 'rin_wayfarer', condition: { kind: 'flag', key: 'world.wanderer' }, hidden: true },
    ],
    onEnter: { setFlags: { stigma_treated: true } },
  },
  {
    id: 'rin_wayfarer',
    title: 'Scene R-04k — 등을 돌리다',
    body: [
      '*너는 진실도, 권력도, 각성도 — 그 무엇도 택하지 않는다. 대신, 등을 돌린다.*',
      '*손목의 결정은 멈추지 않을 것이다. 남은 시간이 얼마든 — 그 시간만큼은, 온전히 *너의 것*이다.*',
      '*너는 한 번도 본 적 없는 지평선을 향해 걷기 시작한다.*',
    ],
    choices: [
      { kind: 'plain', id: 'walk_away', label: '걷는다 — 한 번도 본 적 없는 곳으로.', to: 'ending_wayfarer' },
    ],
    onEnter: {},
  },
  {
    id: 'ending_regency',
    title: '👑 권좌 — 살아남은 타락자',
    body: [
      '*침식이 멎는다 — 제국의 손에서. 너는 고위층의 자리에 오른다.*',
      '정의는 버렸고, 살아남았다. 한때 폭로하려던 시스템의 일부가 되어 — 이제 너는 추적당하는 쪽이 아니라, 추적하는 쪽에 선다.',
      '— 거울 속 자신을 마주할 때만, 잠시 옛 휘장의 무게가 떠오른다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'regency',
    onEnter: {},
  },
  {
    id: 'ending_purge',
    title: '🩸 숙청 — 끌려간 자',
    body: [
      '*그들이 너를 끌고 간다. 진실도, 야심도, 침식조차도 — 끝까지 가지 못했다.*',
      '남의 손에 꺼진 불은, 자기 몫의 빛을 *남기지 못한다*.',
      '— 너의 이름은 기록에서 지워졌다. 시신조차, 정제소로.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'purge',
    onEnter: {},
  },
  {
    id: 'ending_wayfarer',
    title: '🧭 여로 — 떠나는 자',
    body: [
      '*너는 등을 돌렸다. 각성도, 권력도, 폭로도 아닌 — 다만 떠남을.*',
      '진실은 다른 누군가가 밝힐 것이다. 너는 다만, 너의 남은 시간을 *너의 것*으로 걷는다.',
      '— 손목에 푸른 결정이 돋은 채 웃으며 걷는, 한 여행자의 소문만이 남는다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'wayfarer',
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
    if (cur?.bodyProse) delete update.body;
    await Scene.findOneAndUpdate({ id: spec.id }, update, { upsert: true });
    console.log(`  upsert: ${spec.id}${spec.isEnding ? ' [엔딩 ' + spec.endingId + ']' : ''}`);
  }

  console.log('── 분기점 패치 (rin_underground) ──');
  {
    const cur = await Scene.findOne({ id: 'rin_underground' }).lean();
    if (!cur) { console.error('✗ rin_underground 없음'); process.exit(1); }
    const choices = [...(cur.choices ?? [])];
    if (!choices.some((c) => c.id === 'pursue_vale')) {
      if (choices.length >= 3) { console.error('✗ 선택지 초과'); process.exit(1); }
      choices.push({ kind: 'plain', id: 'pursue_vale', label: '[베일 박사] 증거의 그 이름을 좇아 — 사라진 연구자를 직접 추적한다.', to: 'rin_vale_pursuit' });
      await Scene.findOneAndUpdate({ id: 'rin_underground' }, { choices });
      console.log('  add: rin_underground/pursue_vale → rin_vale_pursuit');
    } else {
      console.log('  skip: pursue_vale (이미 있음)');
    }
  }

  // 베일 박사 복선 — rin_evidence(이름 발견) + rin_underground(회상). 뜬금없는 추적 방지.
  console.log('── 베일 박사 복선 ──');
  {
    const ev = await Scene.findOne({ id: 'rin_evidence' }).lean();
    if (ev && !ev.body.some((b) => b.includes('베일'))) {
      const eb = [...ev.body];
      const idx = eb.findIndex((b) => b.includes('작은 푸른 병'));
      if (idx >= 0) {
        eb.splice(idx + 1, 0, '병의 밑면, 깨알 같은 각인 하나가 수사관의 눈에 걸린다 — *"정제 책임: B. 베일"*. 사제단의 성흔 연구를 이끈다는, 소문으로만 떠돌던 그 이름이다.');
        await Scene.findOneAndUpdate({ id: 'rin_evidence' }, { body: eb });
        console.log('  patch: rin_evidence 베일 복선');
      }
    } else console.log('  skip: rin_evidence 베일 복선 (이미 있음)');

    const ug2 = await Scene.findOne({ id: 'rin_underground' }).lean();
    if (ug2 && !ug2.body.some((b) => b.includes('베일'))) {
      const ub = [...ug2.body];
      const idx = ub.findIndex((b) => b.includes('*인장*의 감촉'));
      if (idx >= 0) {
        ub.splice(idx + 1, 0, '그리고 인장과 함께 나온 그 이름 — **베일 박사**. 사제단이 가장 깊이 숨긴 연구자다. 그를 찾으면, 이 모든 것의 *뿌리*에 닿을지도 모른다.');
        await Scene.findOneAndUpdate({ id: 'rin_underground' }, { body: ub });
        console.log('  patch: rin_underground 베일 회상');
      }
    } else console.log('  skip: rin_underground 베일 회상 (이미 있음)');
  }

  await mongoose.disconnect();
  console.log('✓ #361 린 각성 루트 완료');
}

main().catch((e) => { console.error(e); process.exit(1); });
