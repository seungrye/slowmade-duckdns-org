#!/usr/bin/env node
// scripts/seed-371-stigma-felt.mjs — #160 침식을 몸으로 느끼게 한다.
//
// 회차 피드백 노트가 **서로 다른 두 회차에서 같은 말**을 했다:
//
//   "카엘의 침식도가 100 으로 최대치인데도 그에 따른 물리적·심리적 영향이 충분히
//    드러나지 않았다. 각 단계에서의 체감 변화를 더 구체적으로 묘사해야 한다."
//   "정전의 순간이나 열차 앞에서의 결정 시, 주인공의 내면 갈등이나 심리적 부담을
//    더 강하게 드러내는 대사나 상황을 추가할 수 있다."
//
// 숫자는 오르는데 글이 그걸 말하지 않는다 — 시스템과 서술이 따로 놀았다.
//
// 고치는 방법: 본문에 `{{침식_손}}` 같은 **파생 변수**를 놓는다(lib/web-adventure/stigma-sense).
// 침식도가 오르면 같은 문장이 저절로 무거워진다. 씬마다 다른 감각(손·시야·숨·마음)을 골라
// 벽지처럼 반복되지 않게 한다.
//
//   "복도로 흘러나간다. {{침식_손}}"
//     침식 0   → "…손끝이 조금 시리다."
//     침식 100 → "…굳은 손가락이 접히지 않는다. 손등으로 밀어야 한다."
//
// 노트가 짚은 두 장면(정전의 잔영, 수송 컨테이너 앞)에는 **마음** 감각을 넣어 내면 갈등이
// 침식과 함께 무거워지게 한다.
//
// 멱등: 이미 변수가 박힌 문단은 건드리지 않는다.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

// 씬 → [문단 인덱스, 덧붙일 문장]
// 문단 끝에 한 문장을 잇는다. 새 문단을 만들지 않는 이유는 리빌(문단 단위 노출) 호흡을
// 흐트러뜨리지 않기 위해서다.
const PLAN = {
  // 시작 — 팔의 결정이 주제인 씬. 손으로 연다.
  kael_infirmary: [[1, '{{침식_손}}']],
  // 이동 — 맨발과 굳은 몸. 이미 발가락 묘사가 있으니 손으로 겹치지 않게 받는다.
  kael_corridor: [[0, '{{침식_손}}']],
  // 정전 — 노트가 지목한 장면. 어둠 속 자기 빛을 보는 순간의 내면.
  kael_corridor_spark: [[2, '{{침식_마음}}']],
  // 메스를 쥔 손 — 손.
  kael_corridor_blade: [[1, '{{침식_손}}']],
  // 위조 성공 후 — 긴장이 풀리는 자리에 숨.
  kael_corridor_clear: [[2, '{{침식_숨}}']],
  // 컨테이너 앞 결정 — 노트가 지목한 장면. 뛰어들지 말지 재는 순간의 부담.
  kael_cargo_container: [[2, '{{침식_마음}}']],
  // 추락 직후 — 몸을 일으키는 자리에 숨.
  kael_falling: [[3, '{{침식_숨}}']],
  // 무릎이 굳었다 — 이름부터 침식이다. 손으로 받는다.
  kael_falling_aftermath: [[2, '{{침식_손}}']],
  // 잔해장 — 넓은 곳을 둘러보는 자리에 시야.
  kael_wreckage_hub: [[1, '{{침식_시야}}']],
  // 적하 일지 — 글자를 읽는 장면이라 시야가 가장 아프게 걸린다.
  kael_clue_manifest: [[2, '{{침식_시야}}']],
};

const SceneSchema = new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' });
const Scene = mongoose.models.Scene || mongoose.model('Scene', SceneSchema);

async function main() {
  await mongoose.connect(MONGO_URI);
  let changed = 0;
  let skipped = 0;
  let missing = 0;

  for (const [sceneId, edits] of Object.entries(PLAN)) {
    const scene = await Scene.findOne({ id: sceneId, isDeleted: { $ne: true } }).lean();
    if (!scene) {
      console.warn(`  ⚠ 씬 없음: ${sceneId}`);
      missing += 1;
      continue;
    }

    const body = [...(scene.body ?? [])];
    let touched = false;

    for (const [idx, addition] of edits) {
      if (idx >= body.length) {
        console.warn(`  ⚠ ${sceneId}[${idx}] 문단 없음 (총 ${body.length})`);
        missing += 1;
        continue;
      }
      // 이미 어떤 침식 변수든 박혀 있으면 손대지 않는다(재실행 안전).
      if (/\{\{침식[_단]/.test(body[idx])) {
        skipped += 1;
        continue;
      }
      body[idx] = `${body[idx].trimEnd()} ${addition}`;
      touched = true;
    }

    if (touched) {
      await Scene.updateOne({ id: sceneId }, { $set: { body } });
      changed += 1;
      console.log(`  ✓ ${sceneId}`);
    }
  }

  console.log(`\n침식 체감: 씬 ${changed} 개 갱신, ${skipped} 개 이미 반영, 경고 ${missing} 건`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('✗ 실패:', err);
  process.exit(1);
});
