#!/usr/bin/env node
// scripts/seed-356-omphalos-hub.mjs — #356 옴팔로스 허브화 (슬라이스 A).
//
// 비전(사용자):
//   "옴팔로스까지 가는 길이 너무 직선적이다. 한 가지 목적(=옴팔로스 진입)에 수많은
//    경우의 수를 두고, 그 수단이 나중에 영향을 주거나 만나는 사람/태도가 달라지게."
//
// 슬라이스 A — *다중 진입로 + 중앙 광장 허브 + 세력 동맹*:
//   - 진입 수단마다 *도착 직후 씬*을 따로 둬서(plain/probability 엔 setFlags 가 없으므로)
//     onEnter.setFlags 로 흔적(via_*)을 남긴다. 이 도착 씬이 곧 "그 길로 들어왔을 때
//     만나는 광경/사람".
//   - 모든 진입 → omphalos_plaza(허브) 합류 → {세력 접촉 / 암시장 / 정거장(메인)}.
//   - 세력 동맹은 설득 판정(probability) 성공 시 동맹 flag 부여 → 후반(seed-357)에서
//     클라이맥스 conditional 로 전파.
//
// 도달성(lint): 모든 신규 씬은 plaza/station 으로 복귀. 진입 실패는 기존
//   omphalos_caught_at_gate(석화 엔딩) 유지. ≤3 선택. blackmarket 은 plaza 에서 접근
//   (outskirts→market 제거에 따른 orphan 방지).
//
// idempotent — upsert + 재배선은 정확 일치 검사.

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

// ───────────── 신규 씬 ─────────────

const NEW_SCENES = [
  {
    id: 'omphalos_tunnel',
    title: 'Scene 05a — 광산 폐갱도',
    body: [
      '가스등도 닿지 않는 어둠. 폐갱도의 젖은 돌벽에 너의 숨소리만 부딪혀 되돌아온다. 환기구를 타고 *에테르 가솔린*의 비릿한 냄새가 흘러든다 — 이 지하로도 그것이 흐른다.',
      '어둠 속에서 *성냥불* 하나가 켜진다. 화상으로 절반이 일그러진 얼굴, 나머지 절반엔 *너와 같은 푸른 결정*이 돋은 사내다. "길을 잃었나, 동지? 이 갱도는 옴팔로스 시내로 *곧장* 통하지."',
      '밀수꾼이다. 사제단도 아이언가드도 아닌 자들 — 추락한 세계의 틈새에서 살아가는 부류. 그가 너를 위아래로 훑으며 *이빨 빠진 웃음*을 짓는다. "안내료는… 네 비밀 하나면 충분해."',
    ],
    choices: [
      { kind: 'plain', id: 'follow_smuggler', label: '거래에 응한다 — 비밀을 내주고 안내받는다.', to: 'omphalos_plaza' },
      { kind: 'probability', id: 'go_alone', label: '거절하고 혼자 갱도를 더듬는다.', stat: 'dex', difficulty: 13, onSuccess: 'omphalos_plaza', onFailure: 'omphalos_plaza', stigmaDelta: 4 },
    ],
    onEnter: { setFlags: { via_tunnel: true }, stigmaDelta: 1 },
  },
  {
    id: 'omphalos_arrival_stealth',
    title: 'Scene 06s — 그림자에서 새어 나오다',
    body: [
      '경비의 시야가 닿지 않는 골목 끝, 너는 *숨을 죽인 채* 광장의 가장자리로 흘러나온다. 아무도 너를 보지 못했다 — 그래서 아무도 너에게 빚지지 않았고, 누구도 너를 알지 못한다.',
      '그림자 속에서 너는 *유령*이다. 정거장의 검은 강철이 멀리 보이고, 그 앞을 오가는 사람들의 얼굴엔 *세 달 정렬*을 앞둔 도시의 불안이 어른거린다.',
      '들키지 않았다는 것은 *자유*이자 *고립*이다. 이 도시에서 너의 편은, 오직 너 자신뿐이다.',
    ],
    choices: [
      { kind: 'plain', id: 'into_plaza', label: '군중 속으로 — 중앙 광장으로 섞여든다.', to: 'omphalos_plaza' },
    ],
    onEnter: { setFlags: { via_stealth: true } },
  },
  {
    id: 'omphalos_arrival_forged',
    title: 'Scene 06f — 위조된 이름',
    body: [
      '위조 시민증이 검문관의 손에서 *한참* 머문다. 백은색 사제단 가면을 쓴 관료가 종이와 너의 얼굴을 번갈아 본다. 심장이 굳은 결정처럼 무겁게 뛴다.',
      '"…통과." 관료가 마침내 도장을 찍는다. 그러나 그 눈은 *너의 이름을 기억해 두었다*. 위조 신분은 너를 들여보냈지만, 동시에 *사제단의 장부에* 한 줄을 남겼다.',
      '너는 떳떳한 시민으로 광장에 들어선다 — 다만, *언제든 그 이름이 너를 부를 수* 있다는 불안을 외투 안에 감춘 채.',
    ],
    choices: [
      { kind: 'plain', id: 'into_plaza', label: '시민의 걸음으로 — 중앙 광장으로.', to: 'omphalos_plaza' },
    ],
    onEnter: { setFlags: { via_forged: true }, stigmaDelta: 1 },
  },
  {
    id: 'omphalos_arrival_bribe',
    title: 'Scene 06b — 동전이 연 문',
    body: [
      '동전 한 닢이 경비의 손바닥에서 사라진다. 그가 *슬쩍* 고개를 돌려 게이트를 열어 준다 — 그리고 낮게 속삭인다. "시내에서 곤란한 일이 생기거든 내 이름을 대. 옴팔로스 바닥엔 *빚으로 엮인 자들*이 많거든."',
      '부패한 경비는 적이 아니다 — *거래 상대*다. 그리고 거래는, 한 번 트이면 *또 다른 거래*로 이어지는 법.',
      '너는 동전 몇 닢으로 *연줄* 하나를 샀다. 옴팔로스 같은 도시에서, 연줄은 칼보다 멀리 간다.',
    ],
    choices: [
      { kind: 'plain', id: 'into_plaza', label: '연줄을 품고 — 중앙 광장으로.', to: 'omphalos_plaza' },
    ],
    onEnter: { setFlags: { via_bribe: true, bribe_contact: true } },
  },
  {
    id: 'omphalos_plaza',
    title: 'Scene 06 — 옴팔로스 중앙 광장',
    body: [
      '옴팔로스의 심장 — 중앙 광장. 세 갈래 길이 모이는 이곳에, 솔라리스의 첨탑과 아이언가드의 굴뚝과 세계수의 안개가 *동시에* 보인다. 추락하는 세계의 모든 그림자가 여기서 교차한다.',
      '광장 한복판, 백은색 가면의 사제가 단상 위에서 외친다. "세 달이 정렬하는 사흘 후, *승천의 새벽*이 온다! 정화될 자는 두려워 말라!" 군중의 절반은 무릎 꿇고, 절반은 *외투 깃을 세운 채* 황급히 흩어진다.',
      '시계탑의 바늘이 *종말을 향해* 기울어 간다. 너에게 주어진 시간은 — 사흘. 가솔린 호송 열차가 떠나기 전에, 너는 무엇을 할 것인가.',
    ],
    choices: [
      { kind: 'plain', id: 'to_faction', label: '세력과 접촉한다 — 광장의 그늘에 손짓하는 자들.', to: 'omphalos_faction' },
      { kind: 'plain', id: 'to_market', label: '암시장으로 — 진실의 조각을 산다.', to: 'omphalos_blackmarket' },
      { kind: 'plain', id: 'to_station_main', label: '정거장으로 — 이제 열차를 막는다.', to: 'omphalos_station' },
    ],
    onEnter: { stigmaDelta: 1 },
  },
  {
    id: 'omphalos_faction',
    title: 'Scene 06c — 광장의 세 그늘',
    body: [
      '광장의 가장자리, 세 개의 그늘이 너를 지켜본다. *기름때 묻은 작업복*의 아이언가드 잔당, *이끼 빛 외투*의 네오엘프 밀정, 그리고 *백은빛이 스치는* 후드 — 사제단에 등 돌린 첩자.',
      '셋 모두 같은 열차를 노린다. 그러나 그들이 원하는 *결말*은 제각각이다. 누구의 손을 잡느냐에 따라, 첨탑 위에서 너의 곁에 설 자가 달라진다.',
      '동맹은 거저 얻어지지 않는다. 그들은 너를 *시험*할 것이다 — 너의 말로, 너의 지혜로, 너의 진심으로.',
    ],
    choices: [
      { kind: 'probability', id: 'ally_iron', label: '[언변] 아이언가드 잔당 — 강철의 형제가 되자.', stat: 'cha', difficulty: 13, onSuccess: 'omphalos_ally_iron', onFailure: 'omphalos_plaza', stigmaDelta: 0 },
      { kind: 'probability', id: 'ally_sylvan', label: '[지혜] 네오엘프 밀정 — 숲의 말을 알아듣는다.', stat: 'wis', difficulty: 13, onSuccess: 'omphalos_ally_sylvan', onFailure: 'omphalos_plaza', stigmaDelta: 0 },
      { kind: 'probability', id: 'ally_spy', label: '[지능] 사제단 첩자 — 의식의 비밀을 캐낸다.', stat: 'int', difficulty: 14, onSuccess: 'omphalos_ally_spy', onFailure: 'omphalos_plaza', stigmaDelta: 0 },
    ],
    onEnter: {},
  },
  {
    id: 'omphalos_ally_iron',
    title: 'Scene 06c-i — 강철의 약속',
    body: [
      '잔당의 우두머리가 기름 묻은 손을 내민다. "솔라리스가 우리 형제들을 *연료*로 태웠지. 네가 열차를 멈춰 준다면 — 첨탑 위에서, 아이언가드의 *망치 천 자루*가 너의 뒤에 설 거다."',
      '그가 너의 손목에 *붉은 천 조각*을 묶어 준다. 강철의 형제임을 알리는 표식. "이걸 보면 우리 쪽 누구든 너를 돕는다."',
      '약속은 무겁다. 그러나 무거운 약속만이 첨탑 위에서 *버틴다*.',
    ],
    choices: [
      { kind: 'plain', id: 'back_plaza', label: '약속을 품고 광장으로 돌아간다.', to: 'omphalos_plaza' },
    ],
    onEnter: { setFlags: { ally_ironguard: true } },
  },
  {
    id: 'omphalos_ally_sylvan',
    title: 'Scene 06c-ii — 이끼의 언약',
    body: [
      '네오엘프 밀정이 너의 눈을 *오래* 들여다본다. "너에게서 숲의 냄새가 난다 — 혹은, 숲이 너를 *기억*하는지도." 그녀가 너의 손바닥에 *마른 이끼 한 줌*을 쥐여 준다.',
      '"열차의 의식이 점화되면, 세계수의 뿌리가 마지막으로 *몸부림*칠 거다. 그때 이 이끼가 길을 알려줄 것이야. 영수의 노래를 아는 자에게는 — 숲이 *대답*하지."',
      '그녀는 안개처럼 물러난다. 손바닥의 이끼가 *희미하게 푸른빛*으로 숨 쉰다.',
    ],
    choices: [
      { kind: 'plain', id: 'back_plaza', label: '언약을 품고 광장으로 돌아간다.', to: 'omphalos_plaza' },
    ],
    onEnter: { setFlags: { ally_sylvan: true } },
  },
  {
    id: 'omphalos_ally_spy',
    title: 'Scene 06c-iii — 가면 아래의 진실',
    body: [
      '사제단 첩자가 후드를 *반쯤* 벗는다. 그 얼굴엔 가면이 남긴 *눌린 자국*과, 깊은 환멸이 새겨져 있다. "나도 한때는 믿었지. 승천이 구원이라고. 그러나 의식의 *연료*가 무엇인지 알게 된 날, 나는 가면을 버렸다."',
      '그가 너에게 *접힌 도면*을 건넨다 — 호송 열차 중심의 *발화기* 구조도. "세 달이 겹치는 새벽, 이 발화기가 모든 부유도시의 마력을 *한 점으로* 빨아들인다. 멈추려면, 그 순서를 *정확히 거슬러야* 해."',
      '진실은 무기다. 너는 이제 *의식의 심장*이 어디서 뛰는지 안다.',
    ],
    choices: [
      { kind: 'plain', id: 'back_plaza', label: '진실을 품고 광장으로 돌아간다.', to: 'omphalos_plaza' },
    ],
    onEnter: { setFlags: { knowsAscensionPlot: true, ally_spy: true } },
  },
];

// ───────────── 재배선 ─────────────
//
// outskirts: to_station(→infiltration) / to_market(→blackmarket) / iron_lookout(→station)
//   → [지하통로]tunnel / [게이트]infiltration / iron_lookout(→plaza). to_market 제거
//   (blackmarket 은 plaza 에서 접근).
// infiltration: onSuccess 3종을 arrival_* 로 (현재 모두 omphalos_station).
// blackmarket: to_station_after(→station) 유지 — 변경 없음(plaza 도달로 orphan 해소).

const OUTSKIRTS_CHOICES = [
  { kind: 'plain', id: 'to_tunnel', label: '[지하로] 광산 폐갱도를 통해 — 누구의 눈에도 띄지 않는 길.', to: 'omphalos_tunnel' },
  { kind: 'plain', id: 'to_station', label: '[게이트로] 정거장 잠입을 시도한다.', to: 'omphalos_infiltration' },
  { kind: 'conditional', id: 'iron_lookout', label: '[강철의 망루] 아이언가드 잔당이 너에게 손짓한다.', to: 'omphalos_plaza', condition: { kind: 'flag', key: 'world.revolution_won' }, hidden: true },
];

const INFILTRATION_SUCCESS_REMAP = {
  sneak_in: 'omphalos_arrival_stealth',
  forge_papers: 'omphalos_arrival_forged',
  bribe_guard: 'omphalos_arrival_bribe',
};

// ───────────── 실행 ─────────────

async function upsertScene(Scene, spec) {
  const cur = await Scene.findOne({ id: spec.id }).lean();
  const update = { ...spec, illustration: PLACEHOLDER };
  if (cur?.illustration && !cur.illustration.includes('placeholder')) {
    update.illustration = cur.illustration;
  }
  // 본문 확장(seed-355) 보존: 이미 bodyOriginal 이 있으면 body 는 건드리지 않음.
  if (cur?.bodyOriginal) delete update.body;
  await Scene.findOneAndUpdate({ id: spec.id }, update, { upsert: true });
  console.log(`  upsert: ${spec.id} (${spec.choices.length} 분기)`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  console.log('── 신규 씬 upsert ──');
  for (const s of NEW_SCENES) await upsertScene(Scene, s);

  console.log('── 재배선 ──');
  // outskirts
  {
    const cur = await Scene.findOne({ id: 'omphalos_outskirts' }).lean();
    if (!cur) { console.error('✗ omphalos_outskirts 없음'); process.exit(1); }
    await Scene.findOneAndUpdate({ id: 'omphalos_outskirts' }, { choices: OUTSKIRTS_CHOICES });
    console.log('  rewire: omphalos_outskirts → tunnel/infiltration/plaza(회차)');
  }
  // infiltration onSuccess remap
  {
    const cur = await Scene.findOne({ id: 'omphalos_infiltration' }).lean();
    if (!cur) { console.error('✗ omphalos_infiltration 없음'); process.exit(1); }
    const choices = cur.choices.map((c) => {
      const dst = INFILTRATION_SUCCESS_REMAP[c.id];
      return dst ? { ...c, onSuccess: dst } : c;
    });
    await Scene.findOneAndUpdate({ id: 'omphalos_infiltration' }, { choices });
    console.log('  rewire: omphalos_infiltration onSuccess → arrival_stealth/forged/bribe');
  }

  await mongoose.disconnect();
  console.log('✓ #356 옴팔로스 허브화 (슬라이스 A) 완료');
}

main().catch((e) => { console.error(e); process.exit(1); });
