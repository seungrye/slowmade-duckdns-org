#!/usr/bin/env node
// scripts/seed-act23-omphalos.mjs — #255/#256 옴팔로스 2-3막 + 6 엔딩.
//
// 합류 지점: 옴팔로스의 *에테르 가솔린 열차 탈취 작전*. 사제단이 지상 연료를
// 강탈해 부유도시로 쏘아 올린다. 세 주인공이 *각자의 목적* 으로 이 열차에 잠입.
//
// 교차 영향 (#255): past_runs 의 endingId 가 *world flag* 로 주입되어 분기 조건.
//   world.solaris_strong  — 이전 ascension 도달 (사제단 강화)
//   world.revolution_won  — 이전 revolution 도달 (아이언가드 무장)
//   world.sylvan_awoke    — 이전 sylvan_bond 도달 (영수 깨어남)
//   world.world_fell      — 이전 fall 도달 (잿더미 톤)
//
// 엔딩 6 종 — types/EndingId 와 동기.

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

const scenes = [
  // ── 합류 지점 (omphalos_outskirts 는 이미 placeholder 적치됨, 정상 분기로 교체) ──
  {
    id: 'omphalos_outskirts',
    title: 'Scene 05 — 옴팔로스 외곽',
    illustration: PLACEHOLDER,
    body: [
      '검은 광산 지대 너머로 *옴팔로스* 의 첨탑이 보인다. 중립 도시 — 에테르 가솔린 거래의 십중팔구가 이곳을 지난다.',
      '도시 게이트 앞에 큰 무리. 누군가의 외침. "오늘 새벽 사제단이 *대규모 가솔린 호송 열차* 를 끌고 간다. 막아야 한다."',
      '너의 정체와는 무관하게, 이 도시에서는 *모두가 같은 적* 을 본다. 너의 다음 선택이 회차의 흐름을 결정한다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'to_station',
        label: '역으로 — 열차 잠입을 시도한다.',
        to: 'omphalos_station',
      },
      {
        kind: 'plain',
        id: 'to_market',
        label: '암시장으로 — 정보를 산다.',
        to: 'omphalos_blackmarket',
      },
    ],
  },
  {
    id: 'omphalos_blackmarket',
    title: 'Scene 06 — 블랙마켓',
    illustration: PLACEHOLDER,
    body: [
      '낡은 천막과 깜빡이는 가스등. 비밀과 무기가 같은 가격에 거래되는 곳.',
      '여러 사람의 그림자가 너를 스친다 — 어쩌면 그 중 하나는 *카엘*, 또는 *린*, 또는 *솔벤*. 그러나 모두 후드를 깊이 쓰고 있다. 한 번 마주친 눈빛이 너에게 *무엇을 본 것 같은* 느낌을 남긴다.',
      '정보상이 너에게 작은 종이를 건넨다. "사제단의 본 의식은 *세 달 정렬* 직후, 부유도시 정점에서 — 지상 모든 생명을 *연료* 로 태우려는 것이다. 신계 승천."',
    ],
    onEnter: {
      setFlags: { knowsAscensionPlot: true },
    },
    choices: [
      {
        kind: 'plain',
        id: 'to_station_after',
        label: '역으로 — 알아낸 것을 가지고 열차를 막는다.',
        to: 'omphalos_station',
      },
    ],
  },
  {
    id: 'omphalos_station',
    title: 'Scene 07 — 가솔린 열차',
    illustration: PLACEHOLDER,
    body: [
      '검은 강철 열차가 가솔린 통을 가득 실은 화차를 뒤로 끌고 정거장을 떠난다. 시간이 없다.',
      '너의 결정으로 — 열차를 *멈추거나*, *탈취하거나*, *폭파* 한다. 결과에 따라 세계의 다음 100 년이 결정된다.',
    ],
    choices: [
      {
        kind: 'conditional',
        id: 'sabotage_with_knowledge',
        label: '[지식 활용] 사제단 의식 자체를 무력화한다 — 가장 어려운 길.',
        condition: { kind: 'flag', key: 'knowsAscensionPlot' },
        to: 'climax_harmony_path',
        hidden: true,
      },
      {
        kind: 'probability',
        id: 'derail',
        label: '[완력] 선로를 파괴해 탈선시킨다 — 옴팔로스가 무너질 위험.',
        stat: 'str',
        difficulty: 15,
        onSuccess: 'climax_revolution_path',
        onFailure: 'climax_fall_path',
        stigmaDelta: 2,
      },
      {
        kind: 'probability',
        id: 'hijack',
        label: '[지능] 제어실을 해킹해 열차 자체를 차지한다.',
        stat: 'int',
        difficulty: 14,
        onSuccess: 'climax_revolution_path',
        onFailure: 'climax_fall_path',
        stigmaDelta: 3,
      },
      {
        kind: 'conditional',
        id: 'spirit_swallow',
        label: '[영수의 분노] 세계수의 뿌리를 깨워 열차를 통째로 삼킨다.',
        condition: { kind: 'flag', key: 'spiritBeastDied' },
        to: 'climax_sylvan_path',
        hidden: true,
      },
      {
        kind: 'conditional',
        id: 'priest_deal',
        label: '[거래] 사제단에 합류 — 치료를 대가로.',
        condition: { kind: 'minStat', stat: 'int', min: 8 },
        to: 'climax_ascension_path',
      },
    ],
  },

  // ── 클라이맥스 분기 (각 엔딩 직전 1 씬) ──
  {
    id: 'climax_harmony_path',
    title: 'Scene 08H — 의식을 멈추는 자',
    illustration: PLACEHOLDER,
    body: [
      '사제단의 의식 진로를 알고 있다는 것은 *무기* 다. 너는 열차의 중심 — 의식의 *연료 발화기* 를 찾아낸다.',
      '발화기를 멈추는 일은 단순한 파괴가 아니다 — *세 달의 순환을 자연으로 돌려보내는 일*. 이것은 정확함과 인내, 그리고 *마지막 한 줄기 마법* 을 요구한다.',
      '너의 손이 발화기의 핵심에 닿는다. 너의 결정이 세계의 호흡을 결정한다.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'still_the_engine',
        label: '[지혜] 세 달의 순환에 발화기를 *동조* 시킨다.',
        stat: 'wis',
        difficulty: 17,
        onSuccess: 'ending_harmony',
        onFailure: 'ending_fall',
        stigmaDelta: 5,
      },
    ],
  },
  {
    id: 'climax_revolution_path',
    title: 'Scene 08R — 강철의 손에 들어온 열차',
    illustration: PLACEHOLDER,
    body: [
      '열차는 너의 것이다. 아이언가드의 망치를 든 자들이 너의 차량 앞에 모인다.',
      '"이 열차를 *사용* 하지 *반환* 하지 않는다. 솔라리스의 첨탑을 우리가 부순다."',
      '결정해야 한다 — 너도 함께 갈 것인가, 아니면 *다른 길* 을 갈 것인가.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'join_revolution',
        label: '아이언가드와 함께 — 첨탑을 부순다.',
        to: 'ending_revolution',
      },
      {
        kind: 'plain',
        id: 'reject_revolution',
        label: '거절한다. 너의 길은 다르다.',
        to: 'ending_fall',
      },
    ],
  },
  {
    id: 'climax_sylvan_path',
    title: 'Scene 08S — 세계수의 뿌리',
    illustration: PLACEHOLDER,
    body: [
      '영수의 깃털이 너의 손바닥에서 뜨겁게 빛난다. 너는 외친다 — 너의 종족의 가장 오래된 노래로.',
      '지각이 갈라진다. 세계수의 뿌리가 옴팔로스의 광산 지대를 뚫고 솟아오른다.',
      '열차의 강철은 이끼로 덮이고, 가솔린은 흙으로 돌아간다. 인간의 비명은 영수의 노래에 묻힌다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'embrace_sylvan',
        label: '숲의 일부가 된다.',
        to: 'ending_sylvan_bond',
      },
    ],
  },
  {
    id: 'climax_ascension_path',
    title: 'Scene 08A — 사제단의 손길',
    illustration: PLACEHOLDER,
    body: [
      '백은의 가면이 너를 영접한다. "현명한 선택이다. 우리는 너에게 *치료* 와 *영생* 을 약속한다 — 단, 너의 침식된 몸이 *연료 회수* 의 마지막 단계가 되어줄 것."',
      '의식의 중심에 너는 눕는다. 세 달이 너의 머리 위에서 정렬한다. 너의 침식이 *연료 가공* 의 마지막 단계로 변환된다.',
      '너는 더 이상 *카엘 / 린 / 솔벤* 이 아니다 — *영원의 사제* 다. 그러나 너의 옛 이름이 새겨지는 순간, 너는 아래에서 누군가의 비명을 듣는다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'ascend',
        label: '승천한다.',
        to: 'ending_ascension',
      },
    ],
  },
  {
    id: 'climax_fall_path',
    title: 'Scene 08F — 흐트러진 모든 것',
    illustration: PLACEHOLDER,
    body: [
      '판정이 빗나갔다. 열차는 너의 손을 빠져나가고, 사제단은 의식을 완료한다.',
      '세 달이 겹친다. 부유도시 엔진의 마력이 한 번에 빠져나간다.',
      '하늘이 비명을 지른다. 부유도시들이 비명도 없이 지상으로 내려앉기 시작한다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'witness_fall',
        label: '잿더미를 본다.',
        to: 'ending_fall',
      },
    ],
  },

  // ── 6 엔딩 씬 ──
  {
    id: 'ending_ascension',
    title: '✨ 승천 — 신계의 부름',
    illustration: PLACEHOLDER,
    body: [
      '은빛 가면의 사제단이 너를 영접한다. 발 밑의 지상은 작아지고, 세 달이 너의 어깨 위에서 빛난다.',
      '너는 더 이상 카엘이 아니다 — 영원의 사제. 그러나 너의 새 이름이 새겨지는 순간, 아래에서 누군가의 비명이 들린 것 같았다. 그것은 아마, 너의 옛 이름일 것이다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'ascension',
  },
  {
    id: 'ending_revolution',
    title: '⚙️ 혁명 — 강철과 증기의 새 시대',
    illustration: PLACEHOLDER,
    body: [
      '아이언가드의 망치가 마침내 솔라리스의 첨탑을 부쉈다. 불타는 부유도시가 지상으로 가라앉으며 검은 연기를 토해낸다.',
      '광장에 모인 군중이 너의 이름을 외치지만, 너는 그 환호 너머의 침묵을 듣는다. 마법은 사라졌고, 강철만 남았다. 다음 시대는 누구의 것인가.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'revolution',
  },
  {
    id: 'ending_harmony',
    title: '☯ 조화 — 세 달의 순환',
    illustration: PLACEHOLDER,
    body: [
      '사제단의 의식을 막고, 가솔린의 흐름을 끊고, 세계수의 노래를 다시 들었다. 세 달은 정렬했지만 — 그것은 종말이 아닌 *호흡* 이었다.',
      '지상의 마력은 다시 흐르기 시작한다. 누군가는 잃었고 누군가는 얻었지만, 세계는 여전히 *함께* 숨 쉰다. 너의 성흔도 천천히 옅어진다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'harmony',
  },
  {
    id: 'ending_fall',
    title: '💀 추락 — 모든 것이 무너진 날',
    illustration: PLACEHOLDER,
    body: [
      '세 달이 겹쳤다. 부유도시가 비명도 없이 지상으로 내려앉았다. 솔라리스도, 아이언가드도, 세계수도 — 모두 잿더미가 되었다.',
      '너는 무너진 첨탑 위에 앉아 새벽이 오지 않는 하늘을 본다. 이제 누구의 잘못인지는 중요하지 않다. 살아남은 자가 다음 이야기를 쓸 뿐이다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'fall',
  },
  {
    id: 'ending_petrification',
    title: '🗿 석화 — 마력석이 된 자',
    illustration: PLACEHOLDER,
    body: [
      '관절이 멈췄다. 호흡이 멎었다. 푸른 결정이 너의 시야를 가르며 자라난다.',
      '너의 마지막 생각은 — 의외로 평화로웠다. 누군가 너의 몸에서 가솔린을 짜낼 것이다. 너의 몫의 빛이 다른 누군가의 등불이 될 것이다. 그것으로 충분하다고, 너는 굳어가며 생각했다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'petrification',
  },
  {
    id: 'ending_sylvan_bond',
    title: '🌿 정령의 결속 — 숲의 귀환',
    illustration: PLACEHOLDER,
    body: [
      '세계수의 뿌리가 지각을 뚫고 솟아올랐다. 영수들의 영혼이 다시 깨어나 인간의 기계를 잠재웠다. 가솔린은 흙으로, 강철은 이끼로 돌아간다.',
      '너는 더 이상 *인간 솔벤* 이 아니다 — 새로운 숲의 첫 심장. 너의 노래는 새로 태어나는 영수의 자장가가 된다. 인간의 시대는 끝났다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'sylvan_bond',
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  // 기존 illustration 이 placeholder 가 아니면 painter 가 생성한 실 URL — 보존.
  for (const s of scenes) {
    const cur = await Scene.findOne({ id: s.id }).lean();
    const update = { ...s };
    if (cur && cur.illustration && !cur.illustration.includes('placeholder')) {
      update.illustration = cur.illustration;
    }
    await Scene.findOneAndUpdate({ id: s.id }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    console.log('upsert:', s.id);
  }
  console.log(`옴팔로스 2-3막 + 6 엔딩 ${scenes.length} 씬 적치`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
