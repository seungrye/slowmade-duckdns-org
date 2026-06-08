#!/usr/bin/env node
// scripts/seed-kael-act1.mjs — #252 Kael 1막 4 씬 mongo 적치.
//
// 외부 AI 기획안 채택 + 〈에테르니아〉 다이스 시스템 매핑.
//   Scene 01 폐기 처분 통보 (의무실)
//   Scene 02 의무실 탈출 (성공 시 복도, 실패 시 적발)
//   Scene 03 가솔린 수송 컨테이너 잠입
//   Scene 04 추락 — 지상 도착
//
// 일러스트는 임시 placeholder (Phase 1c 후속에서 painter-bot 생성).

import mongoose from 'mongoose';

const PLACEHOLDER_ILLUSTRATION = '/web-adventure/scenes/placeholder-square.svg';

const scenes = [
  {
    id: 'kael_infirmary',
    title: 'Scene 01 — 폐기 처분 통보',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '차가운 금속 침대. 사방을 채운 시큼한 에테르 정제수 냄새에 눈이 떠진다.',
      '가장 먼저 느껴지는 건 오른쪽 손목부터 팔꿈치까지 무겁게 굳은 감각. 피부를 뚫고 돋아난 푸른 마력 결정이 가스등 불빛을 받아 기괴하게 반짝인다.',
      '불투명한 유리문 너머로 군의관과 백은색 가면의 사제단이 낮게 속삭인다. "…카엘 하사의 침식도가 80을 넘었습니다. 즉시 지하 정제소로." "아까운 인재군. 사흘은 더 부유도시 엔진을 돌릴 가솔린이 나오겠어."',
      "정제소 이송. 산 채로 마력을 쥐어짜여 연료로 가공된다는 뜻이다. 발소리가 문 앞으로 다가온다. 몇 초 안 남았다.",
    ],
    choices: [
      {
        kind: 'probability',
        id: 'grab_scalpel',
        label: '[완력] 트레이의 메스를 쥐고 숨는다.',
        stat: 'con',
        difficulty: 12,
        onSuccess: 'kael_corridor',
        onFailure: 'kael_caught',
      },
      {
        kind: 'probability',
        id: 'overload_panel',
        label: '[셀레네 마법] 마력 배선반을 폭발시켜 정전을 일으킨다.',
        stat: 'str',
        difficulty: 10,
        onSuccess: 'kael_corridor',
        onFailure: 'kael_caught',
        stigmaDelta: 3,
      },
      {
        kind: 'probability',
        id: 'fake_flatline',
        label: '[지능] 주사기로 가사 상태를 위장한다.',
        stat: 'int',
        difficulty: 14,
        onSuccess: 'kael_corridor',
        onFailure: 'kael_caught',
      },
    ],
  },
  {
    id: 'kael_corridor',
    title: 'Scene 02 — 의무동 복도',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '비상등이 깜빡인다. 의무동 복도의 차가운 타일이 맨발에 닿을 때마다 굳은 발가락이 비명을 지른다.',
      '왼쪽은 수송선 도크. 오른쪽은 사관실. 정면은 시민 거주층으로 통하는 강하정 — 그러나 신원 확인이 필요하다.',
      '경비병의 군화 소리가 사관실 쪽에서 들린다. 결정해야 한다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'to_cargo_dock',
        label: '수송선 도크로 — 가솔린 컨테이너에 잠입한다.',
        to: 'kael_cargo_container',
      },
      {
        kind: 'probability',
        id: 'forge_id',
        label: '[지능] 강하정 단말기 위조 — 시민으로 위장.',
        stat: 'int',
        difficulty: 15,
        onSuccess: 'kael_corridor_clear',
        onFailure: 'kael_caught',
        stigmaDelta: 2,
      },
    ],
  },
  {
    id: 'kael_corridor_clear',
    title: 'Scene 02b — 위조 성공',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '단말기가 녹색으로 깜빡인다. 위조된 시민증 데이터가 통과했다.',
      '하지만 강하정 발사 매뉴얼은 정상 운행. 지금 이 시간엔 화물칸 외에는 갈 수 없다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'to_cargo_dock_after_id',
        label: '결국 수송선 도크로 — 컨테이너에 잠입한다.',
        to: 'kael_cargo_container',
      },
    ],
  },
  {
    id: 'kael_cargo_container',
    title: 'Scene 03 — 가솔린 수송 컨테이너',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '거대한 컨테이너 옆구리에 노란 라벨. 에테르 가솔린 — 500 갤런.',
      '뚜껑을 살짝 들어올린다. 안은 가득 차지 않았다. 한 구석에 몸을 누일 자리가 있다. 액체에 닿지만 않으면 살아남을 수 있다.',
      '컨테이너가 이동 갈고리에 매달려 흔들린다. 곧 발사다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'climb_in',
        label: '들어간다. 다른 길은 없다.',
        to: 'kael_falling',
      },
    ],
    onEnter: {
      addItems: ['ether_gas_canister'],
    },
  },
  {
    id: 'kael_falling',
    title: 'Scene 04 — 추락',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '강하 시퀀스. 컨테이너가 부유도시 바깥으로 떨어진다.',
      '제국군 요격포가 컨테이너 측면을 강타한다. 가솔린이 출렁이며 머리 위로 튄다.',
      '연기, 굉음, 회전하는 시야 — 그리고 지상이 시야에 들어온다. 검은 연기로 뒤덮인 강철과 증기의 땅.',
      '컨테이너가 불타는 잔해와 함께 검은 광산 지대에 쑤셔 박힌다. 살아남았다. 굳어가는 몸을 가까스로 일으킨다. 흙냄새가 난다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'rise_to_ground',
        label: '일어선다. 지상이다.',
        to: 'omphalos_outskirts',
      },
    ],
  },
  // 1막 적발 분기 — 실패 시 도달.
  {
    id: 'kael_caught',
    title: 'Scene 01b — 적발',
    illustration: PLACEHOLDER_ILLUSTRATION,
    body: [
      '문이 박차고 열린다. 군의관의 손이 너의 목덜미를 잡는다.',
      '경비병 둘이 사제단의 가면을 양옆에 두고 너를 끌어낸다. 너는 정제소로 가는 마지막 운반차에 묶인다.',
      '굳어가는 몸이 너의 의지보다 빨리 무너진다. 카운트다운이 끝났다.',
    ],
    choices: [],
    isEnding: true,
    endingId: 'petrification',
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'WebAdventureScene',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );

  // 멱등 — upsert by id.
  // 기존 illustration 이 placeholder 가 아니면 painter 가 생성한 실 URL — 보존.
  for (const s of scenes) {
    const cur = await Scene.findOne({ id: s.id }).lean();
    const update = { ...s };
    if (cur && cur.illustration && !cur.illustration.includes('placeholder')) {
      update.illustration = cur.illustration;
    }
    await Scene.findOneAndUpdate({ id: s.id }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    console.log('upsert:', s.id);
  }
  console.log(`총 ${scenes.length} 씬 적치`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
