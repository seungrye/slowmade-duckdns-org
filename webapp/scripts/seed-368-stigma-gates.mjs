#!/usr/bin/env node
// scripts/seed-368-stigma-gates.mjs — #99 침식 게이트.
//
// 두 곳의 서술과 조건이 어긋나 있었다.
//
// 1) 승천 — climax_ascension_path 는 "침식된 몸이 연료 회수의 마지막 단계가 되어줄 것" 이라
//    말하고 엔딩은 "의식의 마지막 자격자" 라 한다. 그런데 그리로 가는 선택지
//    (station_knowledge_branch 의 [사제단 거래])에 조건이 없어, 침식 0 인 솔벤도 그대로
//    승천할 수 있었다. 연료가 될 침식이 없는데.
//      → stigmaAtLeast 40. 각성(70)보다 낮게 잡는다. 각성은 "제 힘으로 붙든다" 이지만
//        승천은 "재료로 바쳐진다" 이므로 문턱이 더 낮은 편이 이야기에 맞다.
//
// 2) 무흔 — climax_harmony_path 의 [무흔] 은 "성흔을 지닌 자라면 그 자리에서 돌이 되니까,
//    표식 없는 맨살로" 라고 서술하면서 조건은 ability=none 하나뿐이었다. 성흔 능력과
//    침식도는 별개 축이라, 침식 80 인 카엘이 능력만 무흔이면 팔에 결정이 돋은 채로
//    "표식 없는 맨살" 이 되었다.
//      → ability=none AND stigmaAtMost 20.
//
// 막다른 길 점검: 조건을 못 채워도 station_knowledge_branch 에는 [의식 동조]·[다시 결정]이,
//   climax_harmony_path 에는 확률 선택지가 남는다.
//
// 멱등: 같은 조건을 다시 써도 값이 같으면 mongo 가 변경으로 치지 않는다.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

/** 승천에 필요한 최소 침식 — 연료로 쓰일 만큼은 진행돼 있어야 한다. */
const ASCENSION_MIN_STIGMA = 40;
/** 「표식 없는 맨살」로 통할 상한. */
const UNMARKED_MAX_STIGMA = 20;

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');
  let changed = 0;

  // 1) [사제단 거래] — 승천 진입에 침식 하한.
  const know = await col.findOne({ id: 'station_knowledge_branch' });
  if (know) {
    const choices = (know.choices || []).map((c) => {
      if (c.to !== 'climax_ascension_path') return c;
      return { ...c, kind: 'conditional', hidden: true, condition: { kind: 'stigmaAtLeast', min: ASCENSION_MIN_STIGMA } };
    });
    const r = await col.updateOne({ id: 'station_knowledge_branch' }, { $set: { choices } });
    if (r.modifiedCount) changed++;
  } else console.warn('  - 씬 없음: station_knowledge_branch');

  // 2) [무흔] — 능력과 침식을 함께 본다.
  const harmony = await col.findOne({ id: 'climax_harmony_path' });
  if (harmony) {
    const choices = (harmony.choices || []).map((c) => {
      const isNone = c.condition?.kind === 'ability' && c.condition?.required === 'none';
      if (!isNone) return c;
      return {
        ...c,
        condition: {
          kind: 'all',
          conditions: [
            { kind: 'ability', required: 'none' },
            { kind: 'stigmaAtMost', max: UNMARKED_MAX_STIGMA },
          ],
        },
      };
    });
    const r = await col.updateOne({ id: 'climax_harmony_path' }, { $set: { choices } });
    if (r.modifiedCount) changed++;
  } else console.warn('  - 씬 없음: climax_harmony_path');

  console.log(`seed-368-stigma-gates: 변경 ${changed}개 씬 (승천 ≥${ASCENSION_MIN_STIGMA} · 무흔 ≤${UNMARKED_MAX_STIGMA})`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-368-stigma-gates 실패:', e.message);
  process.exit(1);
});
