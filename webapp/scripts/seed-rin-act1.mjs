#!/usr/bin/env node
// scripts/seed-rin-act1.mjs — #253 Rin 1막 4 씬.
//
// 린 / Rin — 아이언가드 공국 하급 수사관.
//   Scene 01 검은 항만 — 밀수 적발 현장.
//   Scene 02 사제단 인장 — 솔라리스 인장 발견.
//   Scene 03 상관 배신 — 상급 수사관의 암살 시도.
//   Scene 04 지하 잠적 — 옴팔로스로.

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

const scenes = [
  {
    id: 'rin_harbor',
    title: 'Scene 01 — 검은 연기의 항만',
    illustration: PLACEHOLDER,
    body: [
      '굴뚝의 검은 연기가 별을 가린 새벽. 아이언가드 공국 제 3 항만 — 가솔린 밀수의 십중팔구가 여기를 지난다.',
      '익명 제보. "오늘 새벽 컨테이너 7-B 라인에 솔라리스로 가는 검은 화물." 너는 권총을 점검하고, 부두 위 크레인 그림자에 몸을 숨긴다.',
      '저 아래 부두에 작은 회의가 보인다. 가면을 쓴 자 하나, 그를 호위하는 무장 셋, 그리고 인부 둘이 컨테이너 자물쇠를 깬다.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'shoot_lock',
        label: '[지급 권총] 자물쇠 깨기 전 권총으로 사격해 무력화.',
        stat: 'dex',
        difficulty: 13,
        onSuccess: 'rin_evidence',
        onFailure: 'rin_chase',
      },
      {
        kind: 'probability',
        id: 'sneak_closer',
        label: '[민첩] 그림자로 접근해 대화 도청.',
        stat: 'dex',
        difficulty: 11,
        onSuccess: 'rin_evidence',
        onFailure: 'rin_chase',
      },
      {
        kind: 'probability',
        id: 'badge_arrest',
        label: '[수사관 배지] 정식 체포 시도 — 지원 호출.',
        stat: 'cha',
        difficulty: 14,
        onSuccess: 'rin_evidence',
        onFailure: 'rin_chase',
      },
    ],
  },
  {
    id: 'rin_evidence',
    title: 'Scene 02 — 사제단의 인장',
    illustration: PLACEHOLDER,
    body: [
      '체포된 밀수꾼의 외투 안주머니. 무겁고 차가운 금속이 손에 잡힌다.',
      '은빛으로 빛나는 인장 — 솔라리스 제국 사제단의 그것. 그것도 *고위급* 의.',
      '이상하다. 아이언가드 영내의 가솔린 밀수에 *제국 사제단* 이 직접 관여? 지금까지의 기록은 모두 *상인 단체* 의 단독 범행으로 처리됐었다. 누군가 위에서 진실을 가렸다.',
      '본부에 보고해야 한다. 그러나 — 어디로?',
    ],
    onEnter: {
      addItems: ['imperial_seal'],
    },
    choices: [
      {
        kind: 'plain',
        id: 'to_supervisor',
        label: '직속 상급 수사관에게 즉시 보고.',
        to: 'rin_betrayal',
      },
      {
        kind: 'plain',
        id: 'to_press',
        label: '신문사 정보원에게 미리 흘리고 본부로.',
        to: 'rin_betrayal',
      },
    ],
  },
  {
    id: 'rin_betrayal',
    title: 'Scene 03 — 상관의 배신',
    illustration: PLACEHOLDER,
    body: [
      '본부의 새벽은 조용하다. 너는 보고서를 들고 상급 수사관실의 문을 두드린다.',
      '"…사제단의 인장이라고?" 그가 한 박자 늦게 일어선다. 책상의 서랍이 열려 있다. *권총* 이 책상 위에 놓여 있다.',
      '"린, 자네는 좋은 수사관이야. 그러나 이번 건은 — *없었던 일* 로 해야 해."',
      '뒤에서 문이 잠기는 소리. 그의 손이 권총으로 향한다. 결정해야 한다.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'shoot_first',
        label: '[지급 권총] 먼저 쏜다.',
        stat: 'dex',
        difficulty: 14,
        onSuccess: 'rin_underground',
        onFailure: 'rin_caught',
      },
      {
        kind: 'probability',
        id: 'talk_down',
        label: '[언변] 그를 진정시키며 시간을 번다.',
        stat: 'cha',
        difficulty: 15,
        onSuccess: 'rin_underground',
        onFailure: 'rin_caught',
      },
      {
        kind: 'probability',
        id: 'window_escape',
        label: '[민첩] 창문으로 — 2 층이지만 다른 방법이 없다.',
        stat: 'dex',
        difficulty: 12,
        onSuccess: 'rin_underground',
        onFailure: 'rin_caught',
      },
    ],
  },
  {
    id: 'rin_underground',
    title: 'Scene 04 — 지하 잠적',
    illustration: PLACEHOLDER,
    body: [
      '본부 뒷골목. 너는 후드를 쓰고 빠른 걸음으로 광산 지대 쪽으로 향한다.',
      '아이언가드 안에는 더 이상 안전한 곳이 없다. 사제단의 손길은 너의 직속 상관에게까지 닿아 있었다.',
      '동료 한 명이 지하 통로를 알려준다. 가솔린 밀수의 또 다른 종착지 — *중립 도시 옴팔로스*. 그곳이라면 진실을 들어줄 누군가가 있을지 모른다.',
      '인장은 너의 외투 안주머니에 있다. 너는 이제 도망자가 아니라 — 추적자다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'to_omphalos',
        label: '옴팔로스로 향한다.',
        to: 'omphalos_outskirts',
      },
    ],
  },
  {
    id: 'rin_chase',
    title: 'Scene 01b — 추격당함',
    illustration: PLACEHOLDER,
    body: [
      '컨테이너 옆구리에 권총 탄환이 박힌다. 너의 위치가 노출됐다.',
      '가면 쓴 자의 신호. 무장한 셋이 일제히 너를 향해 달려온다.',
      '크레인 위의 너는 도망갈 곳이 없다. 가솔린이 흥건한 부두로 떨어진 너의 부츠에서 액체가 튄다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'fall',
  },
  {
    id: 'rin_caught',
    title: 'Scene 03b — 책상 위에서',
    illustration: PLACEHOLDER,
    body: [
      '한 박자 늦었다. 상급 수사관의 권총이 너의 가슴을 향한다.',
      '"미안하다, 린. 진실은 — *너무 비싼 값*이 매겨져 있어."',
      '총성. 책상 위의 보고서가 너의 피로 물든다. 사제단의 인장이 부드럽게 빛난다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'fall',
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const s of scenes) {
    await Scene.findOneAndUpdate({ id: s.id }, s, { upsert: true, new: true, setDefaultsOnInsert: true });
    console.log('upsert:', s.id);
  }
  console.log(`Rin 1막 ${scenes.length} 씬 적치`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
