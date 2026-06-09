#!/usr/bin/env node
// scripts/seed-349-narrative-strengthening.mjs — #349 시나리오 개연성 보강 (P0~P3).
//
// 검토 의견:
//   P0-1: 사제단 의식 정체 명시 — *부유도시 엔진 동력 흡수 의식* 단서 추가
//         (omphalos_outskirts / omphalos_station / omphalos_blackmarket / climax_fall_path).
//   P0-2: kael_cargo_container.climb_in 라벨 + body[1] *뚜껑 폐쇄 + 벽 붙잡기* 의도 일치.
//   P1  : omphalos_outskirts → omphalos_station 사이 중간 침투 씬 (omphalos_infiltration) 신설,
//         3 분기 (민첩/지능/카리스마) probability + 실패 시 기존 kael_caught_minor 재이용.
//   P2-1: omphalos_station 사자 등장 라인 (저 멀리 → *대형 확성기* 방송) 명확화.
//   P2-2: kael_struggled body 에 *어깨 결정 파편* 부상 연속성 1 줄 추가.
//   P3  : kael_cargo_container body[0] 에 *에테르 가솔린 기괴 성질* 묘사 추가.
//
// 설계 — patch 방식 (insertAt / replaceAt). 이전 시드 (npc-names, stigma-items,
//   omphalos-cameo, ending-aftermath 등) 의 누적 patch 줄을 *보존*. idempotent —
//   재실행 시 중복 patch 안 함 (정확 일치 라인 또는 marker 검사).

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

// ───────────── 1. 신규 씬 ─────────────

const NEW_SCENE_INFILTRATION = {
  id: 'omphalos_infiltration',
  title: 'Scene 06i — 옴팔로스 정거장 잠입',
  body: [
    '옴팔로스의 게이트는 *중립 도시* 였다 — 그러나 가솔린 호송 열차가 정거장에 들어선 새벽, *경비병이 두 배로 늘었다*.',
    '정거장 외곽의 *철망 너머* — 검은 강철 열차의 화차들이 이미 *연결을 끝내고* 있다. 너에게 남은 시간은 얼마 없다.',
    '세 길이 있다. 어두운 골목을 *민첩하게* 빠져나가거나, *위조 시민증* 으로 게이트를 *지나거나*, 경비병의 손에 *동전 한 닢* 을 *쥐어 주는* 것.',
  ],
  choices: [
    {
      kind: 'probability',
      id: 'sneak_in',
      label: '[민첩] 골목의 어둠으로 — 경비를 *우회한다*.',
      stat: 'dex',
      difficulty: 13,
      onSuccess: 'omphalos_station',
      onFailure: 'kael_caught_minor',
      stigmaDelta: 2,
    },
    {
      kind: 'probability',
      id: 'forge_papers',
      label: '[지능] 위조 시민증 — 게이트를 *지나간다*.',
      stat: 'int',
      difficulty: 14,
      onSuccess: 'omphalos_station',
      onFailure: 'kael_caught_minor',
      stigmaDelta: 3,
    },
    {
      kind: 'probability',
      id: 'bribe_guard',
      label: '[카리스마] 경비병의 손에 *동전 한 닢* — 매수.',
      stat: 'cha',
      difficulty: 12,
      onSuccess: 'omphalos_station',
      onFailure: 'kael_caught_minor',
      stigmaDelta: 1,
    },
  ],
  onEnter: { stigmaDelta: 2 },
};

// ───────────── 2. body patch 정의 ─────────────
//
// 두 가지 작업 종류:
//   - insertLine: body 의 특정 위치에 1 줄 삽입 (이미 있으면 skip — idempotent).
//   - replaceMatching: 본문에서 *마커 문자열* 을 포함한 줄을 *새 줄* 로 교체. 마커는
//     기존 시드들 (act23-omphalos 등) 에서 유래한 *고정 구문* 기반.

const BODY_PATCHES = [
  // P3 — kael_cargo_container body[0]. "에테르 가솔린 — 500 갤런" → 기괴 강조 보강.
  {
    sceneId: 'kael_cargo_container',
    op: 'replaceMatching',
    marker: '에테르 가솔린 — 500 갤런',
    newLine:
      '거대한 컨테이너 옆구리에 노란 라벨. 에테르 가솔린 — 500 갤런. *푸른 빛을 발하는 점성 액체* 가 출렁인다. 인간의 마력을 *압축한 비명의 흔적* — 표면에서 *희미한 한숨* 같은 기화가 피어오른다.',
    desc: '가솔린 기괴 성질',
  },
  // P0-2 — kael_cargo_container body[1]. 안에 누워있기 → 뚜껑 폐쇄 + 벽 붙잡기 (climb_in 라벨 일치).
  {
    sceneId: 'kael_cargo_container',
    op: 'replaceMatching',
    marker: '안은 가득 차지 않았다',
    newLine:
      '뚜껑을 살짝 들어올린다. 안은 가득 차지 않았다 — 벽면을 따라 *손가락이 걸릴 돌출부* 가 있다. *뚜껑을 다시 닫고* 벽에 매달려 있으면 액체에 닿지 않고 살아남을 수 있다.',
    desc: '뚜껑 폐쇄 + 벽 붙잡기',
  },
  // P0-1 — omphalos_outskirts. body 끝 직전에 *의식 정체 단서* 1 줄 삽입.
  //   "너의 정체와는 무관하게" 직전 (= 마지막에서 2 번째) 에 끼움.
  {
    sceneId: 'omphalos_outskirts',
    op: 'insertBefore',
    beforeMarker: '너의 정체와는 무관하게',
    line: '곁의 노인이 *낮게 속삭인다*. "저 열차의 *에테르 코어* — 세 달이 겹치는 새벽, *부유도시 엔진의 마력을 한 번에 빨아들이는* 의식의 *점화기* 라네. 그 후엔 — 모두 떨어진다네."',
    desc: '노인의 속삭임 — 의식 정체 단서',
  },
  // P0-1 + P2-1 — omphalos_station. "저 멀리 사제단의 사자가 차가운 미소로 말한다" 라인 교체.
  //   *대형 확성기* 방송으로 공간 명확 + 의식 = 도시 동력 흡수 명시.
  {
    sceneId: 'omphalos_station',
    op: 'replaceMatching',
    marker: '저 멀리 사제단의 사자가',
    newLine:
      '정거장의 *대형 확성기* 가 사제단 사자의 음성을 흘려보낸다 — 차가운 미소가 라디오 송출의 *잡음 너머* 로. "*이 열차는 부유도시의 동력을 거두는 점화기다. 세 달이 겹치는 새벽, 너희 도시는 — 우리에게 마력을 *돌려준다*. 너는 그 안에 *포함될지*, *제외될지* 선택할 뿐.*"',
    desc: '확성기 방송 + 의식 정체',
  },
  // P0-1 — omphalos_blackmarket. 정보상의 *세 달 정렬* 종이 라인 교체.
  //   기존: "지상 모든 생명을 *연료* 로 태우려는 것이다. 신계 승천."
  //   새  : "에테르 코어가 부유도시 엔진의 마력을 *한 번에 흡수* — 도시가 떨어진다. 신계 승천."
  {
    sceneId: 'omphalos_blackmarket',
    op: 'replaceMatching',
    marker: '사제단의 본 의식은 *세 달 정렬*',
    newLine:
      '정보상이 너에게 작은 종이를 건넨다. "사제단의 본 의식은 *세 달 정렬* 직후, 호송 열차의 *에테르 코어* 가 부유도시 정점에서 점화 — *모든 부유도시 엔진의 마력을 한 번에 흡수* 한다. 도시들은 *동력 없이 떨어진다*. 사제단은 그 마력으로 *신계 승천*."',
    desc: '의식의 실체 — 동력 흡수 인과',
  },
  // P0-1 — climax_fall_path. "부유도시 엔진의 마력이 한 번에 빠져나간다" 라인 교체.
  //   *호송 열차의 에테르 코어 = 의식의 점화기* 인과 연결.
  {
    sceneId: 'climax_fall_path',
    op: 'replaceMatching',
    marker: '부유도시 엔진의 마력이 한 번에 빠져나간다',
    newLine:
      '세 달이 겹친다. 호송 열차의 *에테르 코어* 가 점화되고 — *모든 부유도시 엔진의 마력* 이 그 한 점을 향해 빨려들어간다. 동력이 *완전히* 빠져나간다.',
    desc: '의식 = 동력 흡수 인과',
  },
  // P2-2 — kael_struggled. body[1] "온몸의 푸른 결정이 충격에 따라 *균열*" 라인에
  //   *어깨 결정 파편* 부상 연속성 1 문장 추가.
  {
    sceneId: 'kael_struggled',
    op: 'replaceMatching',
    marker: '온몸의 푸른 결정이 충격에 따라',
    newLine:
      '온몸의 푸른 결정이 충격에 따라 *균열*. 침식이 *깊숙이* 파고든다. *어깨에 박힌 푸른 결정 파편* 에서 마력 섞인 피가 흘러내린다. 그러나 — 너는 살아 있다. 아직.',
    desc: '어깨 결정 파편 부상 연속성',
  },
];

// ───────────── 3. 분기 재지정 ─────────────

const OUTSKIRTS_REDIRECT = { choiceId: 'to_station', to: 'omphalos_infiltration' };

// kael_cargo_container.climb_in 라벨 (P0-2).
const CARGO_CHOICE_CLIMB_IN_LABEL = '[완력] 뚜껑을 다시 *팔 힘으로* 폐쇄 — *벽을 붙잡고* 액체 위에 매달린다.';

// ───────────── 실행 ─────────────

async function upsertWithIllustrationGuard(Scene, sceneSpec) {
  const cur = await Scene.findOne({ id: sceneSpec.id }).lean();
  const update = { ...sceneSpec, illustration: PLACEHOLDER };
  if (cur && cur.illustration && !cur.illustration.includes('placeholder')) {
    update.illustration = cur.illustration;
  }
  await Scene.findOneAndUpdate({ id: sceneSpec.id }, update, { upsert: true, new: true });
}

async function applyBodyPatch(Scene, patch) {
  const cur = await Scene.findOne({ id: patch.sceneId }).lean();
  if (!cur) {
    console.error(`✗ patch — 씬 없음: ${patch.sceneId}`);
    process.exit(1);
  }
  const body = [...(cur.body ?? [])];

  if (patch.op === 'replaceMatching') {
    const idx = body.findIndex((b) => b.includes(patch.marker));
    if (idx < 0) {
      // 이미 *새 줄* 자체가 들어 있다면 idempotent skip.
      if (body.some((b) => b === patch.newLine)) {
        console.log(`  skip: ${patch.sceneId} / ${patch.desc} (이미 적용)`);
        return;
      }
      console.error(`✗ marker 못 찾음: ${patch.sceneId} — "${patch.marker}"`);
      process.exit(1);
    }
    if (body[idx] === patch.newLine) {
      console.log(`  skip: ${patch.sceneId} / ${patch.desc} (이미 정확 일치)`);
      return;
    }
    body[idx] = patch.newLine;
  } else if (patch.op === 'insertBefore') {
    if (body.includes(patch.line)) {
      console.log(`  skip: ${patch.sceneId} / ${patch.desc} (이미 적용)`);
      return;
    }
    const idx = body.findIndex((b) => b.includes(patch.beforeMarker));
    if (idx < 0) {
      console.error(`✗ beforeMarker 못 찾음: ${patch.sceneId} — "${patch.beforeMarker}"`);
      process.exit(1);
    }
    body.splice(idx, 0, patch.line);
  } else {
    console.error(`✗ unknown op: ${patch.op}`);
    process.exit(1);
  }

  await Scene.findOneAndUpdate({ id: patch.sceneId }, { body });
  console.log(`  patch: ${patch.sceneId} / ${patch.desc} (${body.length} 줄)`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  // 1. 신규 침투 씬 upsert.
  await upsertWithIllustrationGuard(Scene, NEW_SCENE_INFILTRATION);
  console.log(`upsert: ${NEW_SCENE_INFILTRATION.id} (${NEW_SCENE_INFILTRATION.choices.length} 분기, stigmaΔ+${NEW_SCENE_INFILTRATION.onEnter.stigmaDelta})`);

  // 2. body patches.
  for (const p of BODY_PATCHES) {
    await applyBodyPatch(Scene, p);
  }

  // 3. kael_cargo_container.choices.climb_in.label (P0-2).
  {
    const cur = await Scene.findOne({ id: 'kael_cargo_container' }).lean();
    if (!cur) { console.error('✗ kael_cargo_container 없음'); process.exit(1); }
    const choices = cur.choices.map((c) => {
      if (c.id !== 'climb_in') return c;
      return { ...c, label: CARGO_CHOICE_CLIMB_IN_LABEL };
    });
    await Scene.findOneAndUpdate({ id: 'kael_cargo_container' }, { choices });
    console.log(`  patch: kael_cargo_container / climb_in 라벨 (뚜껑 폐쇄)`);
  }

  // 4. omphalos_outskirts.to_station → omphalos_infiltration (P1).
  {
    const cur = await Scene.findOne({ id: 'omphalos_outskirts' }).lean();
    if (!cur) { console.error('✗ omphalos_outskirts 없음'); process.exit(1); }
    const choices = cur.choices.map((c) => {
      if (c.id !== OUTSKIRTS_REDIRECT.choiceId) return c;
      return { ...c, to: OUTSKIRTS_REDIRECT.to };
    });
    await Scene.findOneAndUpdate({ id: 'omphalos_outskirts' }, { choices });
    console.log(`  redirect: omphalos_outskirts / to_station → ${OUTSKIRTS_REDIRECT.to}`);
  }

  await mongoose.disconnect();
  console.log('✓ #349 narrative strengthening 완료');
}

main().catch((e) => { console.error(e); process.exit(1); });
