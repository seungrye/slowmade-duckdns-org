#!/usr/bin/env node
// scripts/seed-solwen-act1.mjs — #254 Solwen 1막.
//
// 솔벤 / Solwen — 네오-엘프 자치령 옥수.
//   Scene 01 세계수 사냥터 — 인간 밀렵단 발견.
//   Scene 02 영수 전투 — 기계 톱과 가솔린 화염.
//   Scene 03 영수의 죽음 — 세계수 원천 파괴 인지.
//   Scene 04 숲을 떠남 — 복수 맹세.

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

const scenes = [
  {
    id: 'solwen_grove',
    title: 'Scene 01 — 안개 낀 사냥터',
    illustration: PLACEHOLDER,
    body: [
      '세계수 외곽. 새벽 안개가 이끼 위에 무겁게 깔린다. 너의 정령 활은 등에서 부드럽게 숨쉰다.',
      '저기, 안개 사이로 인간들의 그림자. 셋, 아니 넷. 기름통과 — *기계 톱*. 너의 종족이 가장 증오하는 그 물건.',
      '그 너머에 — 흰빛이 도는 거대한 영수의 옆구리. 깊은 잠에 든 사슴 형상의 영수가 그들의 표적이다.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'arrow_first',
        label: '[정령 활] 화살로 먼저 친다.',
        stat: 'dex',
        difficulty: 11,
        onSuccess: 'solwen_combat',
        onFailure: 'solwen_combat_hard',
      },
      {
        kind: 'probability',
        id: 'wake_spirit',
        label: '[지혜] 영수를 먼저 깨워 함께 싸운다.',
        stat: 'wis',
        difficulty: 13,
        onSuccess: 'solwen_combat',
        onFailure: 'solwen_combat_hard',
      },
      {
        kind: 'probability',
        id: 'frighten_chant',
        label: '[헤카테 환영] 환영으로 그들을 흩어지게 한다.',
        stat: 'cha',
        difficulty: 12,
        onSuccess: 'solwen_combat',
        onFailure: 'solwen_combat_hard',
        stigmaDelta: 2,
      },
    ],
  },
  {
    id: 'solwen_combat',
    title: 'Scene 02 — 전투의 한가운데',
    illustration: PLACEHOLDER,
    body: [
      '첫 번째 인간이 쓰러진다. 두 번째가 기계 톱을 켠다 — 굉음에 영수가 깨어난다.',
      '영수의 흰 뿔이 안개를 가르고, 그 발굽이 흙을 진동시킨다. 셋이 함께 — 잠시는 이긴다.',
      '하지만 마지막 인간이 가솔린 통의 꼭지를 연다. 액체가 흩뿌려진다. 라이터가 *찰칵*.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'shoot_canister',
        label: '[정령 활] 가솔린 통을 쏘아 폭발시킨다.',
        stat: 'dex',
        difficulty: 14,
        onSuccess: 'solwen_grief',
        onFailure: 'solwen_grief',
      },
      {
        kind: 'probability',
        id: 'shield_spirit',
        label: '[헤카테 환영] 환영의 안개로 영수를 가린다.',
        stat: 'cha',
        difficulty: 13,
        onSuccess: 'solwen_grief',
        onFailure: 'solwen_grief',
        stigmaDelta: 3,
      },
    ],
  },
  {
    id: 'solwen_combat_hard',
    title: 'Scene 02b — 너무 늦었다',
    illustration: PLACEHOLDER,
    body: [
      '너의 첫 수가 빗나갔다. 인간들의 라이터가 *먼저* 떨어진다.',
      '가솔린 화염이 영수의 옆구리를 핥는다. 영수가 처음 듣는 비명 — 그것은 *짐승의 소리* 가 아닌 *고대의 노래* 였다.',
      '너는 살아남았다. 그러나 영수는 — 살아남지 못한다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'to_grief',
        label: '쓰러진 영수에게 다가간다.',
        to: 'solwen_grief',
      },
    ],
  },
  {
    id: 'solwen_grief',
    title: 'Scene 03 — 영수의 죽음',
    illustration: PLACEHOLDER,
    body: [
      '흰 뿔이 천천히 기울어진다. 영수의 흑요석 눈동자가 너를 마주본다 — 원망이 아닌, 단지 *피곤함* 으로.',
      '너는 무릎을 꿇고 영수의 뺨에 손을 댄다. 그의 마지막 숨결과 함께, *세계수의 진동* 이 너의 손바닥을 통해 전해진다.',
      '*세계수의 원천이 파괴되고 있다.* 이것은 단순한 사냥이 아니다 — 인간들은 *마법 자체* 를 짜내고 있다. 영수의 피로, 세계수의 수액으로.',
      '영수의 깃털 하나가 너의 손에 남는다. 너의 분노가 활보다 무거워진다.',
    ],
    onEnter: {
      addItems: ['spirit_beast_feather'],
      setFlags: { spiritBeastDied: true },
    },
    choices: [
      {
        kind: 'plain',
        id: 'to_revenge',
        label: '복수의 길로.',
        to: 'solwen_departure',
      },
    ],
  },
  {
    id: 'solwen_departure',
    title: 'Scene 04 — 숲을 떠나며',
    illustration: PLACEHOLDER,
    body: [
      '너의 옥수 직무는 끝났다. 더 이상 *지키는 자* 가 아니다 — 이제 *추적하는 자* 다.',
      '세계수의 가지가 너의 등 뒤로 닫힌다. 안개가 너의 발자국을 지운다. 너는 인간들의 길 — *옴팔로스* 로 향한다.',
      '깃털이 외투 안에서 미세하게 빛난다. 영수의 영혼이 너의 분노에 동행한다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'to_omphalos',
        label: '옴팔로스로 — 인간의 도시로.',
        to: 'omphalos_outskirts',
      },
    ],
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
  console.log(`Solwen 1막 ${scenes.length} 씬 적치`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
