#!/usr/bin/env node
// scripts/seed-station-restructure.mjs — #262 옴팔로스 역 분기 3 제한.
//
// 변경:
//   omphalos_station: 5 → 3 plain 선택지 (접근 방식).
//     [강철의 길] → climax_revolution_path (직진 — 기존 derail+hijack 통합)
//     [지식의 길] → station_knowledge_branch (간 단계)
//     [영혼의 길] → station_spirit_branch (간 단계)
//   신규: station_knowledge_branch (3 분기 — 의식 동조 / 사제단 거래 / 되돌아간다)
//   신규: station_spirit_branch (2 분기 — 세계수 깨움 / 되돌아간다)

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

const updates = [
  {
    id: 'omphalos_station',
    body: [
      '검은 강철 열차가 가솔린 통을 가득 실은 화차를 뒤로 끌고 정거장을 떠난다. 시간이 없다.',
      '저 멀리 사제단의 사자가 차가운 미소로 말한다. "*이것은 막을 수 있는 것이 아니다. 단지 — 너가 그 안에 *포함될지*, *제외될지* 선택할 뿐.*"',
      '너의 결정으로 — 열차를 *멈추거나*, *탈취하거나*, *폭파* 한다. 어떤 길로 다가갈 것인가.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'path_steel',
        label: '[강철의 길] 무력으로 — 탈선 또는 탈취.',
        to: 'station_path_steel',
      },
      {
        kind: 'plain',
        id: 'path_knowledge',
        label: '[지식의 길] 사제단 의식 자체를 파헤친다.',
        to: 'station_knowledge_branch',
      },
      {
        kind: 'plain',
        id: 'path_spirit',
        label: '[영혼의 길] 세계수의 노래로 — 자연의 길.',
        to: 'station_spirit_branch',
      },
    ],
  },
  {
    id: 'station_path_steel',
    title: 'Scene 07a — 강철의 결단',
    illustration: PLACEHOLDER,
    body: [
      '열차의 폭주를 *멈춰* 또는 *차지* 한다. 둘 다 강철과 강철의 충돌이다.',
      '머리로 갈 것인가, 가슴으로 갈 것인가.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'derail',
        label: '[완력] 선로를 파괴해 탈선시킨다.',
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
        kind: 'plain',
        id: 'back_to_station',
        label: '다시 결정한다.',
        to: 'omphalos_station',
      },
    ],
  },
  {
    id: 'station_knowledge_branch',
    title: 'Scene 07b — 지식의 결단',
    illustration: PLACEHOLDER,
    body: [
      '사제단의 의식은 *연료의 강탈* 이 아니라 *자기 자신을 신계로 올리는 사기극*. 너는 그것을 안다.',
      '의식 자체를 *멈출* 것인가, 아니면 너도 그 안에 *포함될* 것인가.',
    ],
    choices: [
      {
        kind: 'conditional',
        id: 'sabotage_with_knowledge',
        label: '[의식 동조] 발화기를 멈춰 — 가장 어려운 길.',
        condition: { kind: 'flag', key: 'knowsAscensionPlot' },
        to: 'climax_harmony_path',
        hidden: true,
      },
      {
        kind: 'conditional',
        id: 'priest_deal',
        label: '[사제단 거래] 합류 — 치료를 대가로 신계 승천.',
        condition: { kind: 'minStat', stat: 'int', min: 7 },
        to: 'climax_ascension_path',
        hidden: true,
      },
      {
        kind: 'plain',
        id: 'back_to_station_2',
        label: '다시 결정한다.',
        to: 'omphalos_station',
      },
    ],
  },
  {
    id: 'station_spirit_branch',
    title: 'Scene 07c — 영혼의 결단',
    illustration: PLACEHOLDER,
    body: [
      '영수의 노래가 너의 손바닥에서 미세하게 진동한다. 세계수의 뿌리는 *아직 잠들지 않았다*.',
      '깨우면 — 인간의 모든 기계를 잠재울 수 있다. 그러나 그것은 *인간 시대의 종말* 이기도 하다.',
    ],
    choices: [
      {
        kind: 'conditional',
        id: 'spirit_swallow',
        label: '[영수의 분노] 세계수의 뿌리를 깨워 모든 것을 삼킨다.',
        condition: { kind: 'flag', key: 'spiritBeastDied' },
        to: 'climax_sylvan_path',
        hidden: true,
      },
      {
        kind: 'plain',
        id: 'back_to_station_3',
        label: '다시 결정한다 — 너의 길은 아직 다른 곳에.',
        to: 'omphalos_station',
      },
    ],
  },
];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  for (const u of updates) {
    await Scene.findOneAndUpdate({ id: u.id }, u, { upsert: true, new: true, setDefaultsOnInsert: true });
    console.log('upsert:', u.id, `(${u.choices.length} 분기)`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
