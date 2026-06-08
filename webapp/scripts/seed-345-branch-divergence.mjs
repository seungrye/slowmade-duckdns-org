#!/usr/bin/env node
// scripts/seed-345-branch-divergence.mjs — #345 6 씬 probability 분기 분리.
//
// 디자인 의도 — *각 분기의 수단 (메스/마법/위장 등) 이 결과 씬에도 반영*. A success → C-1,
// B success → C-2, A failure → D-1, B failure → D-2. 합류 후 *기존 다음 씬* 으로 통일.
//
// 변경:
//   1. 신규 우회/결과 씬 31 종 upsert (illustration 보호 가드).
//   2. 6 씬 의 각 probability 분기 onSuccess/onFailure 재지정.
//      예외 — kael_infirmary 의 fake_flatline onFailure 는 kael_caught (석화 직행) 로 유지.
//   3. 기존 우회 씬 (kael_struggled, rin_pursued, rin_betrayal_aftermath, solwen_combat_hard 등)
//      은 *유지* — 삭제 금지. 추후 추가 활용 가능.

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

// ───────────── Scene Spec ─────────────
// 각 새 씬은 다음 합류 씬으로 흐름. 본문 2~3 줄, 시나리오 톤 일관.

const NEW_SCENES = [
  // ───── kael_infirmary success 3 분기 → kael_corridor ─────
  {
    id: 'kael_corridor_blade',
    title: 'Scene 02a-i — 손에 쥐인 메스',
    body: [
      '메스의 손잡이가 손바닥의 땀과 푸른 결정 가루로 끈적인다. 군의관은 발치에서 신음을 흘리고 — 너는 *그를 죽이지 않았다*.',
      '복도로 미끄러져 나간다. 자국이 남은 칼날을 외투 안에 숨기고, 비상등의 깜빡임 속으로.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 복도로.', to: 'kael_corridor' },
    ],
    onEnter: { hpDelta: -1, stigmaDelta: 1 },
  },
  {
    id: 'kael_corridor_spark',
    title: 'Scene 02a-ii — 정전의 잔영',
    body: [
      '셀레네의 푸른 불꽃이 패널을 *터뜨렸다*. 의무동 전체가 어둠에 잠긴다. 너의 손목 결정도 함께 *번쩍*, 침식이 깊어진다.',
      '비상등이 다시 켜지기 전 — 그 짧은 공백을 타고 복도로 흘러나간다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 어둠 속으로.', to: 'kael_corridor' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 3 },
  },
  {
    id: 'kael_corridor_pale',
    title: 'Scene 02a-iii — 창백한 운반차',
    body: [
      '맥박이 *멈춘 척*. 군의관이 욕을 내뱉으며 시신용 운반차를 호출한다. 너는 흰 천 아래에서 눈을 감고 호흡을 죽인다.',
      '운반차가 복도 모퉁이를 도는 순간 — 너는 천을 걷고 *조용히* 내려선다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 운반차에서 이탈.', to: 'kael_corridor' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 0 },
  },

  // ───── kael_infirmary failure 2 분기 → kael_corridor (kael_struggled 유지, 분기별 변형) ─────
  {
    id: 'kael_struggled_blade',
    title: 'Scene 01a-fail — 메스를 떨어뜨렸다',
    body: [
      '손이 *떨렸다*. 메스가 군의관의 어깨를 스쳤을 뿐 — 그가 비명을 지르며 경비를 부른다.',
      '너는 깨진 유리창으로 몸을 던진다. 어깨에 박힌 푸른 결정 파편이 *비명을 지른다*.',
      '복도로 비틀거리며 들어선다. 메스는 — 떨어진 자리에 남았다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 부상 상태로 복도로.', to: 'kael_corridor' },
      // 기존 우회 씬 kael_struggled 재이용 — *더 깊은 발각* 분기.
      { kind: 'plain', id: 'to_deep_struggle', label: '경비병들의 외침이 *더* 가까워진다 — 추가 도주.', to: 'kael_struggled' },
    ],
    onEnter: { hpDelta: -5, stigmaDelta: 5 },
  },
  {
    id: 'kael_struggled_spark',
    title: 'Scene 01b-fail — 역류한 마력',
    body: [
      '셀레네의 부름이 *너의 결정을 먼저* 태웠다. 패널은 멀쩡하고, 너의 손목에서 푸른 연기가 피어오른다.',
      '경비병들의 발소리가 울린다. 너는 비틀거리며 비상문을 박차고 복도로 — *침식이 손목까지 올라왔다*.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 침식의 통증 속에서.', to: 'kael_corridor' },
    ],
    onEnter: { hpDelta: -3, stigmaDelta: 8 },
  },

  // ───── rin_harbor success 3 분기 → rin_evidence ─────
  {
    id: 'rin_evidence_breach',
    title: 'Scene 02a-i — 폭파된 자물쇠',
    body: [
      '총성이 항구 새벽에 메아리친다. 자물쇠가 *조각나*, 컨테이너 문이 무겁게 열린다.',
      '안쪽 — 푸른 결정 정제수가 통째로. 너는 손에 권총을 쥔 채 *증거 한가운데로* 들어선다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 증거 확보.', to: 'rin_evidence' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 1 },
  },
  {
    id: 'rin_evidence_shadow',
    title: 'Scene 02a-ii — 그림자에서',
    body: [
      '발소리 하나 없이 — 너는 컨테이너 옆구리에 붙는다. 밀수꾼 둘이 등을 돌린 채 푸른 결정 상자를 옮기고 있다.',
      '그 틈에 외투 안 *사제단 인장* 이 떨어진다. 너는 *조용히* 그것을 집어든다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 인장을 들고.', to: 'rin_evidence' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 0 },
  },
  {
    id: 'rin_evidence_legal',
    title: 'Scene 02a-iii — 휘장 아래',
    body: [
      '*황실 수사관 배지*. 밀수꾼들이 손을 든다. 너는 *합법의 권능* 으로 컨테이너 안에 들어선다.',
      '하지만 — 너의 휘장이 누구의 시선에 닿았는지, 너는 아직 모른다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 공식 확보.', to: 'rin_evidence' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 0 },
  },

  // ───── rin_harbor failure 3 분기 → rin_evidence (rin_pursued 변형) ─────
  {
    id: 'rin_pursued_lock',
    title: 'Scene 01a-fail — 빗나간 총성',
    body: [
      '총성이 *허공* 을 갈랐다. 자물쇠는 멀쩡하고, 너의 위치만 *항구 전체* 에 알려졌다.',
      '뒷골목으로 달린다. 컨테이너 밖 *간이 보관함* 에 떨어진 상자 — 거기 인장 하나가 굴러나온다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 외곽에서 단서 회수.', to: 'rin_evidence' },
      // 기존 우회 씬 rin_pursued 재이용 — *추적이 더 깊이 붙는* 경로.
      { kind: 'plain', id: 'to_full_pursuit', label: '경적이 *더 가까워진다* — 본격 추격.', to: 'rin_pursued' },
    ],
    onEnter: { hpDelta: -5, stigmaDelta: 3 },
  },
  {
    id: 'rin_pursued_silence',
    title: 'Scene 01b-fail — 들킨 발걸음',
    body: [
      '안개 속 — 너의 발이 *깨진 병* 을 밟았다. 밀수꾼들이 일제히 너를 돌아본다.',
      '뒷걸음치며 몸을 던진다. 부두의 차가운 물이 너의 결정을 *깨물고*, 너는 헤엄쳐 옆 부두로.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 물에 젖은 채.', to: 'rin_evidence' },
    ],
    onEnter: { hpDelta: -4, stigmaDelta: 4 },
  },
  {
    id: 'rin_pursued_badge',
    title: 'Scene 01c-fail — 거부당한 휘장',
    body: [
      '*그것은 진짜 황실 휘장이 아니었다*. 밀수꾼이 비웃으며 칼을 뽑는다 — 너의 휘장이 *위조* 였음을 그가 안다.',
      '너는 그 자의 손목을 비틀고 도주. 항구 외곽의 폐창고 — 거기 흩어진 증거 조각 몇 점.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 휘장 위에 피를 묻히고.', to: 'rin_evidence' },
    ],
    onEnter: { hpDelta: -6, stigmaDelta: 3 },
  },

  // ───── rin_betrayal success 3 분기 → rin_underground ─────
  {
    id: 'rin_underground_shot',
    title: 'Scene 03a-i — 먼저 쏘았다',
    body: [
      '호프만의 가슴에서 *붉은 꽃* 이 피어난다. 그가 책상에 무너진다 — 너의 상관이었다. 너의 *멘토* 였다.',
      '너는 권총을 떨어뜨리고 본부 뒷문으로. 손이 *피로 끈적이지만*, 발걸음은 차갑다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 지하로.', to: 'rin_underground' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 5 },
  },
  {
    id: 'rin_underground_talk',
    title: 'Scene 03a-ii — 설득의 가면',
    body: [
      '호프만이 너를 *놓아준다*. "내일 너의 가족은 안전할 것이다 — *이번엔*." 그의 눈빛엔 동정도 분노도 없다.',
      '너는 묵례하고 본부를 나선다. 어깨에 짊어진 것은 — *그가 너를 살려둔 빚*.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 빚을 안고 지하로.', to: 'rin_underground' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 1 },
  },
  {
    id: 'rin_underground_window',
    title: 'Scene 03a-iii — 깨진 창',
    body: [
      '유리창이 *너의 어깨* 와 함께 깨졌다. 3 층의 차가운 새벽 공기 — 너는 회벽을 타고 내려선다.',
      '아래 골목 — 검은 정장의 *아이언가드 연락책* 이 차를 대놓고 기다리고 있었다. "예상보다 빨랐군."',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 검은 차에 오른다.', to: 'rin_underground' },
    ],
    onEnter: { hpDelta: -2, stigmaDelta: 1 },
  },

  // ───── rin_betrayal failure 3 분기 → rin_underground (rin_betrayal_aftermath 변형) ─────
  {
    id: 'rin_betrayal_aftermath_shot',
    title: 'Scene 03b-fail — 빗나간 첫 발',
    body: [
      '너의 총이 *반응하지 않았다*. 호프만의 미소가 깊어지고, 그의 권총이 먼저 너의 옆구리를 *뜯어낸다*.',
      '너는 책상 뒤로 굴러떨어진다 — 방탄 휘장이 한 번 더 너를 살린다. 비밀 통로의 *철문* 까지, 피를 흘리며.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 큰 부상으로 지하로.', to: 'rin_underground' },
      // 기존 우회 씬 rin_betrayal_aftermath 재이용 — *피의 휘장* 무게로 잠시 정지.
      { kind: 'plain', id: 'to_blood_oath', label: '피 묻은 휘장의 무게 — 잠시 멈춰선다.', to: 'rin_betrayal_aftermath' },
    ],
    onEnter: { hpDelta: -10, stigmaDelta: 8 },
  },
  {
    id: 'rin_betrayal_aftermath_talk',
    title: 'Scene 03c-fail — 설득 실패',
    body: [
      '호프만이 *깊게 웃는다*. "너는 아직도 내가 너를 살릴 거라 믿는군." 손짓 한 번 — 옆방에서 *두 명의 부하* 가 들어선다.',
      '너는 책상 다리를 부수고 그 파편으로 길을 낸다. 본부의 *오래된 환풍구* 가 지하로 떨어진다 — 너의 운명처럼.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 환풍구를 통해.', to: 'rin_underground' },
    ],
    onEnter: { hpDelta: -7, stigmaDelta: 5 },
  },
  {
    id: 'rin_betrayal_aftermath_window',
    title: 'Scene 03d-fail — 추락',
    body: [
      '창문이 *너무 빨리* 열렸다. 너는 3 층에서 *제대로 잡히지 못한 채* 떨어진다. 어깨가 *둔탁한 소리* 와 함께 부서진다.',
      '아래 — 누군가의 그림자가 너를 *받아준다*. 검은 정장. 차가운 손. "*늦었지만*, 살아 있군."',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 부서진 몸으로 지하로.', to: 'rin_underground' },
    ],
    onEnter: { hpDelta: -8, stigmaDelta: 3 },
  },

  // ───── solwen_grove success 3 분기 → solwen_combat ─────
  {
    id: 'solwen_combat_arrow',
    title: 'Scene 02a-i — 첫 화살',
    body: [
      '시위가 *조용히 노래한다*. 첫 화살이 인간의 무릎에 박힌다. 그가 비명을 지르고, 그 비명에 *영수가 깨어난다*.',
      '안개 속에서 흰 뿔이 천천히 일어선다. 너의 화살통엔 *세 발* 만 남았다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 영수와 함께 전투.', to: 'solwen_combat' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 0 },
  },
  {
    id: 'solwen_combat_spirit',
    title: 'Scene 02a-ii — 영수의 부름',
    body: [
      '너의 손바닥이 이끼 위에 닿는다 — *깊고 차가운 떨림*. 흰 뿔이 *너를 알아본다*. 영수가 일어선다.',
      '인간들이 라이터를 꺼내든다. 너와 영수 사이엔 *천 년의 약속* 이 흐른다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 약속과 함께.', to: 'solwen_combat' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 0 },
  },
  {
    id: 'solwen_combat_chant',
    title: 'Scene 02a-iii — 위협의 주문',
    body: [
      '너의 입에서 *오래된 음절* 이 흘러나온다. 안개가 *너의 의지에* 응답하여 검은 손가락처럼 인간들을 휘감는다.',
      '그들이 *비명을 지르며* 물러선다 — 그러나 한 명이 라이터를 떨어뜨리고, 마른 풀에 *불꽃* 이 옮겨붙는다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 불꽃 속으로.', to: 'solwen_combat' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 2 },
  },

  // ───── solwen_grove failure 3 분기 → solwen_combat_hard (변형) ─────
  {
    id: 'solwen_combat_hard_arrow',
    title: 'Scene 02b-fail — 빗나간 화살',
    body: [
      '시위가 *흔들렸다*. 화살이 나무 둥치에 박힌다. 인간들의 눈빛이 *동시에* 너를 향한다.',
      '그들의 라이터가 *먼저* 떨어진다. 마른 풀이 *분노하듯* 타오르고 — 영수는 *깨어나지 못한 채* 화염에 갇힌다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 늦은 싸움.', to: 'solwen_combat_hard' },
    ],
    onEnter: { hpDelta: -3, stigmaDelta: 1 },
  },
  {
    id: 'solwen_combat_hard_spirit',
    title: 'Scene 02c-fail — 흔들리지 않은 영수',
    body: [
      '너의 손바닥이 *공허하게* 떨린다. 영수는 *너를 알아보지 못한다* — 천 년의 약속이 *너의 손에는 없다*.',
      '인간들이 라이터를 던진다. 화염의 벽이 *너와 영수 사이를 가른다*.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 가른 채로.', to: 'solwen_combat_hard' },
    ],
    onEnter: { hpDelta: -2, stigmaDelta: 2 },
  },
  {
    id: 'solwen_combat_hard_chant',
    title: 'Scene 02d-fail — 거꾸로 돌아온 주문',
    body: [
      '너의 음절이 *서툴렀다*. 안개가 *너를 향해* 손가락을 뻗는다 — 너의 결정이 *함께 울린다*.',
      '인간들이 그 틈에 라이터를 *세 군데* 떨어뜨린다. 숲이 *전부* 타오른다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 화염의 한가운데로.', to: 'solwen_combat_hard' },
    ],
    onEnter: { hpDelta: -4, stigmaDelta: 5 },
  },

  // ───── solwen_combat success 2 분기 → solwen_grief ─────
  {
    id: 'solwen_grief_canister',
    title: 'Scene 03a-i — 터진 통',
    body: [
      '너의 화살이 *연료통* 을 관통한다. 폭발이 인간들을 *날려버린다* — 하지만 *그 불꽃이* 영수의 옆구리도 핥는다.',
      '흰 뿔이 *비명도 지르지 못한 채* 천천히 무너진다. 너는 그 옆에 무릎을 꿇는다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 무릎 꿇은 채.', to: 'solwen_grief' },
    ],
    onEnter: { hpDelta: -2, stigmaDelta: 2 },
  },
  {
    id: 'solwen_grief_shield',
    title: 'Scene 03a-ii — 방패가 된 마력',
    body: [
      '너의 푸른 마력이 *영수를 감싼다*. 인간들의 칼이 너의 결정 벽에 부딪혀 *부서진다*.',
      '그러나 — 마력의 대가. 영수의 옆구리에서 *너의 결정 색* 이 번진다. 영수가 *너를 위해* 마력을 받아 들였다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 받아 들인 침식.', to: 'solwen_grief' },
    ],
    onEnter: { hpDelta: -1, stigmaDelta: 4 },
  },

  // ───── solwen_combat failure 2 분기 → solwen_grief (변형) ─────
  {
    id: 'solwen_grief_canister_fail',
    title: 'Scene 03b-fail — 폭발이 늦었다',
    body: [
      '너의 화살이 *통의 측면을 스쳤다*. 폭발은 *너의 발치에서* 일어나고 — 인간들은 영수를 *먼저* 베어낸다.',
      '흰 뿔이 *너를 보호하며* 무너진다. 너의 가슴에 *깊은 빈자리* 가 새겨진다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 빈자리를 안고.', to: 'solwen_grief' },
    ],
    onEnter: { hpDelta: -4, stigmaDelta: 3 },
  },
  {
    id: 'solwen_grief_shield_fail',
    title: 'Scene 03c-fail — 무너진 방패',
    body: [
      '너의 마력 벽이 *세 군데에서 깨졌다*. 인간의 칼이 영수의 옆구리에 *깊게* 박힌다.',
      '너의 결정도 *그 충격에* 균열. 둘 다 — *영수와 너* — 같은 색의 피를 흘린다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 같은 피로.', to: 'solwen_grief' },
    ],
    onEnter: { hpDelta: -5, stigmaDelta: 6 },
  },

  // ───── station_path_steel success 2 분기 → climax_revolution_path ─────
  {
    id: 'climax_revolution_path_derail',
    title: 'Scene 07a-i — 탈선의 굉음',
    body: [
      '너의 신호가 정확했다. 열차가 *횡단 분기점에서* 갈빗대처럼 부러진다. 사제단의 의식 차량이 *옆으로 무너진다*.',
      '아이언가드의 망치꾼들이 *환호한다*. 너는 폭음 속에 *그들 가운데로* 걸어 들어선다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 망치꾼들과 함께.', to: 'climax_revolution_path' },
    ],
    onEnter: { hpDelta: -2, stigmaDelta: 0 },
  },
  {
    id: 'climax_revolution_path_hijack',
    title: 'Scene 07a-ii — 점거한 객실',
    body: [
      '너는 *기관실의 푸른 결정 패널* 을 손에 쥔다. 열차의 모든 시스템이 *너의 명령* 으로 응답한다.',
      '사제단의 의식 차량을 *분리* 시킨다 — 그 차량은 *허공에 매달린 채* 너의 처분을 기다린다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 패널을 손에 쥔 채.', to: 'climax_revolution_path' },
    ],
    onEnter: { hpDelta: 0, stigmaDelta: 2 },
  },

  // ───── station_path_steel failure 2 분기 → climax_fall_path (변형) ─────
  {
    id: 'climax_fall_path_derail',
    title: 'Scene 07b-fail — 빗나간 분기점',
    body: [
      '너의 신호가 *0.7 초 늦었다*. 열차는 *완벽한 속도로* 사제단의 정제소로 향한다 — 아이언가드의 망치꾼들이 *허공에 망치를 휘두른다*.',
      '너는 그들의 분노 속에서 *무력하게* 서 있다. 의식의 푸른 빛이 *지평선을 덮는다*.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 빛이 덮이는 곳으로.', to: 'climax_fall_path' },
    ],
    onEnter: { hpDelta: -3, stigmaDelta: 4 },
  },
  {
    id: 'climax_fall_path_hijack',
    title: 'Scene 07c-fail — 거부된 패널',
    body: [
      '*기관실의 패널이 너를 거부한다*. 너의 결정이 *너무 침식되었다* — 열차는 *너의 손을 뿌리치고* 사제단의 길을 달린다.',
      '너는 객실 창에 *손바닥을 댄 채* 의식의 빛이 *세상을 덮는 것을* 본다.',
    ],
    choices: [
      { kind: 'plain', id: 'continue', label: '계속 — 창에 손을 댄 채.', to: 'climax_fall_path' },
    ],
    onEnter: { hpDelta: -2, stigmaDelta: 6 },
  },
];

// ───────────── 분기 재지정 ─────────────

const REDIRECTS = [
  // kael_infirmary success 3 분기 (kael_corridor → 분리)
  { sceneId: 'kael_infirmary', choiceId: 'grab_scalpel',   newSuccess: 'kael_corridor_blade' },
  { sceneId: 'kael_infirmary', choiceId: 'overload_panel', newSuccess: 'kael_corridor_spark' },
  { sceneId: 'kael_infirmary', choiceId: 'fake_flatline',  newSuccess: 'kael_corridor_pale'  },
  // kael_infirmary failure 2 분기 (kael_struggled → 분리). fake_flatline 은 kael_caught 유지.
  { sceneId: 'kael_infirmary', choiceId: 'grab_scalpel',   newFailure: 'kael_struggled_blade' },
  { sceneId: 'kael_infirmary', choiceId: 'overload_panel', newFailure: 'kael_struggled_spark' },

  // rin_harbor success 3 분기 (rin_evidence → 분리)
  { sceneId: 'rin_harbor', choiceId: 'shoot_lock',   newSuccess: 'rin_evidence_breach' },
  { sceneId: 'rin_harbor', choiceId: 'sneak_closer', newSuccess: 'rin_evidence_shadow' },
  { sceneId: 'rin_harbor', choiceId: 'badge_arrest', newSuccess: 'rin_evidence_legal'  },
  // rin_harbor failure 3 분기 (rin_pursued → 분리)
  { sceneId: 'rin_harbor', choiceId: 'shoot_lock',   newFailure: 'rin_pursued_lock'    },
  { sceneId: 'rin_harbor', choiceId: 'sneak_closer', newFailure: 'rin_pursued_silence' },
  { sceneId: 'rin_harbor', choiceId: 'badge_arrest', newFailure: 'rin_pursued_badge'   },

  // rin_betrayal success 3 분기 (rin_underground → 분리)
  { sceneId: 'rin_betrayal', choiceId: 'shoot_first',    newSuccess: 'rin_underground_shot'   },
  { sceneId: 'rin_betrayal', choiceId: 'talk_down',      newSuccess: 'rin_underground_talk'   },
  { sceneId: 'rin_betrayal', choiceId: 'window_escape',  newSuccess: 'rin_underground_window' },
  // rin_betrayal failure 3 분기 (rin_betrayal_aftermath → 분리)
  { sceneId: 'rin_betrayal', choiceId: 'shoot_first',    newFailure: 'rin_betrayal_aftermath_shot'   },
  { sceneId: 'rin_betrayal', choiceId: 'talk_down',      newFailure: 'rin_betrayal_aftermath_talk'   },
  { sceneId: 'rin_betrayal', choiceId: 'window_escape',  newFailure: 'rin_betrayal_aftermath_window' },

  // solwen_grove success 3 분기 (solwen_combat → 분리)
  { sceneId: 'solwen_grove', choiceId: 'arrow_first',    newSuccess: 'solwen_combat_arrow'  },
  { sceneId: 'solwen_grove', choiceId: 'wake_spirit',    newSuccess: 'solwen_combat_spirit' },
  { sceneId: 'solwen_grove', choiceId: 'frighten_chant', newSuccess: 'solwen_combat_chant'  },
  // solwen_grove failure 3 분기 (solwen_combat_hard → 분리)
  { sceneId: 'solwen_grove', choiceId: 'arrow_first',    newFailure: 'solwen_combat_hard_arrow'  },
  { sceneId: 'solwen_grove', choiceId: 'wake_spirit',    newFailure: 'solwen_combat_hard_spirit' },
  { sceneId: 'solwen_grove', choiceId: 'frighten_chant', newFailure: 'solwen_combat_hard_chant'  },

  // solwen_combat success 2 분기 (solwen_grief → 분리)
  { sceneId: 'solwen_combat', choiceId: 'shoot_canister', newSuccess: 'solwen_grief_canister' },
  { sceneId: 'solwen_combat', choiceId: 'shield_spirit',  newSuccess: 'solwen_grief_shield'   },
  // solwen_combat failure 2 분기 (solwen_grief → 분리)
  { sceneId: 'solwen_combat', choiceId: 'shoot_canister', newFailure: 'solwen_grief_canister_fail' },
  { sceneId: 'solwen_combat', choiceId: 'shield_spirit',  newFailure: 'solwen_grief_shield_fail'   },

  // station_path_steel success 2 분기 (climax_revolution_path → 분리)
  { sceneId: 'station_path_steel', choiceId: 'derail', newSuccess: 'climax_revolution_path_derail' },
  { sceneId: 'station_path_steel', choiceId: 'hijack', newSuccess: 'climax_revolution_path_hijack' },
  // station_path_steel failure 2 분기 (climax_fall_path → 분리)
  { sceneId: 'station_path_steel', choiceId: 'derail', newFailure: 'climax_fall_path_derail' },
  { sceneId: 'station_path_steel', choiceId: 'hijack', newFailure: 'climax_fall_path_hijack' },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // 1. 신규 씬 upsert (illustration 보호 가드).
  for (const scene of NEW_SCENES) {
    const cur = await Scene.findOne({ id: scene.id }).lean();
    const update = { ...scene, illustration: PLACEHOLDER };
    if (cur && cur.illustration && !cur.illustration.includes('placeholder')) {
      update.illustration = cur.illustration;
    }
    await Scene.findOneAndUpdate({ id: scene.id }, update, { upsert: true, new: true });
    console.log('upsert:', scene.id, `(hpΔ${scene.onEnter.hpDelta}, stigmaΔ+${scene.onEnter.stigmaDelta})`);
  }

  // 2. 분기 재지정 — onSuccess / onFailure.
  //    같은 (sceneId, choiceId) 에 onSuccess 와 onFailure 가 각각 별도 record 로 들어와도
  //    누적 적용되도록 한 씬당 1 번씩만 fetch / update.
  const grouped = new Map(); // sceneId → choiceId → { onSuccess?, onFailure? }
  for (const r of REDIRECTS) {
    if (!grouped.has(r.sceneId)) grouped.set(r.sceneId, new Map());
    const choiceMap = grouped.get(r.sceneId);
    if (!choiceMap.has(r.choiceId)) choiceMap.set(r.choiceId, {});
    const upd = choiceMap.get(r.choiceId);
    if (r.newSuccess) upd.onSuccess = r.newSuccess;
    if (r.newFailure) upd.onFailure = r.newFailure;
  }

  for (const [sceneId, choiceMap] of grouped) {
    const cur = await Scene.findOne({ id: sceneId }).lean();
    if (!cur) { console.log('없음:', sceneId); continue; }
    const choices = cur.choices.map((c) => {
      const upd = choiceMap.get(c.id);
      if (!upd) return c;
      return { ...c, ...upd };
    });
    await Scene.findOneAndUpdate({ id: sceneId }, { choices });
    for (const [cid, upd] of choiceMap) {
      const parts = [];
      if (upd.onSuccess) parts.push(`onSuccess=${upd.onSuccess}`);
      if (upd.onFailure) parts.push(`onFailure=${upd.onFailure}`);
      console.log('redirect:', sceneId, '/', cid, '→', parts.join(', '));
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
