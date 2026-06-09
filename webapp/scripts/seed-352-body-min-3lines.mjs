#!/usr/bin/env node
// scripts/seed-352-body-min-3lines.mjs — #267 body 3줄 규칙 충족.
//
// scene-body-min.test (#267): 엔딩 외 모든 씬 body ≥ 3 줄. 그러나 분기/실패
// 씬 30개가 2줄로 남아 있어, MONGO_URI 주입 시 테스트가 실패했다.
// (평소 env 없이 돌면 skip → 그동안 드러나지 않음.)
//
// 각 씬에 *톤(다크 판타지) + 별표 강조 + 서사 연속* 을 지키는 3번째 줄을 추가.
// 단순 패딩이 아니라 감정 여운 / 다음 장면 연결 / 복선을 담는다.
// 특히 rin_underground_talk 의 추가 줄은 seed-351 의 호프만 생존 콜백
// (omphalos_hoffmann_return) 복선을 심는다.
//
// 멱등: body.length >= 3 이면 skip (첫 실행 2→3, 재실행 skip).

import mongoose from 'mongoose';

const ADDITIONS = {
  kael_corridor_blade:
    '등 뒤에서 군의관의 신음이 점점 멀어진다. 살려둔 것이 자비였는지 *실수* 였는지 — 지금은 알 수 없다.',
  kael_corridor_spark:
    '어둠 속에서 너의 손목만이 *희미하게 푸르다*. 이 빛이 너를 숨겨줄지 *팔아넘길지* — 복도는 대답하지 않는다.',
  kael_corridor_pale:
    '운반차의 바퀴 소리가 멀어진다. 너는 시신 명부에서 *지워진 이름* 으로 — 이제 존재하지 않는 자가 되어 걷는다.',
  kael_struggled_spark:
    '비상등의 붉은 빛이 손목의 푸른 균열을 *번갈아 비춘다*. 시간이 너의 편이 아님을, 너의 몸이 먼저 안다.',
  rin_evidence_breach:
    '총성은 이미 항구의 귀에 닿았다. 증거를 손에 쥐었으나 — *시간* 은 이제 너의 적이다.',
  rin_evidence_shadow:
    '밀수꾼들은 여전히 등을 돌린 채다. 인장은 외투 안에서 *차갑게 무겁다* — 누군가의 죽음을 증언하는 무게.',
  rin_evidence_legal:
    '합법은 너를 안으로 들였으나 *보호* 하지는 않는다. 푸른 정제수 너머 — 누군가의 눈이 이미 너를 *기록* 했다.',
  rin_pursued_lock:
    '등 뒤로 발소리가 모여든다. 굴러나온 인장 하나 — *대가는 컸지만* 빈손은 아니다.',
  rin_pursued_silence:
    '차가운 물이 폐를 짓누른다. 손목의 결정이 *바닷물에 신음하고* — 너는 옆 부두의 그림자로 기어오른다.',
  rin_pursued_badge:
    '그 자는 너의 휘장이 가짜임을 *보았다*. 이제 항구 전체가 곧 알 것이다 — 너는 수사관이 아니라 *도망자* 라는 걸.',
  rin_underground_shot:
    '멘토의 피가 너의 손금에 스며든다. 너는 정의를 위해 *아버지를 쏘았다* — 그 무게는 평생 손에서 지워지지 않는다.',
  rin_underground_talk:
    '그가 너를 살려둔 이유를 너는 아직 모른다. 자비였든 *더 깊은 계산* 이었든 — 그 빚은 언젠가 너를 다시 찾아온다.',
  rin_underground_window:
    '너는 그의 차에 오를지 *등을 돌릴지* 망설인다. 그러나 본부는 이미 너의 뒤에서 문을 닫았다 — 돌아갈 곳은 없다.',
  rin_betrayal_aftermath_shot:
    '옆구리에서 *뜨거운 피* 가 흐른다. 방탄 휘장이 너를 살렸으나 — 다음에도 그러리란 보장은 없다.',
  rin_betrayal_aftermath_talk:
    '환풍구의 어둠이 너를 삼킨다. 호프만의 웃음소리가 *철판을 타고* 따라온다 — 그는 너를 *놓아준 적이 없었다*.',
  rin_betrayal_aftermath_window:
    '부서진 어깨가 *비명* 을 지른다. 차가운 손이 너를 일으킨다 — 적인지 아군인지 모를, 그러나 *유일한* 손이.',
  solwen_combat_arrow:
    '영수의 흰 뿔이 안개를 가른다. 너의 화살은 셋 — *한 발도 빗나갈 수 없다*.',
  solwen_combat_spirit:
    '영수의 숨결이 너의 결정과 *같은 색* 으로 빛난다. 인간들의 라이터가 어둠 속에서 *딸깍* — 약속을 지킬 시간이다.',
  solwen_combat_chant:
    '인간들은 흩어졌으나 *불* 은 흩어지지 않는다. 마른 풀을 타고 번지는 불꽃이 — 너의 승리를 *재* 로 바꾸려 한다.',
  solwen_combat_hard_arrow:
    '불길이 영수와 너 사이에 *벽* 을 세운다. 흰 뿔이 화염 너머에서 *너를 바라본다* — 깨어나지도 못한 채.',
  solwen_combat_hard_spirit:
    '영수의 눈에 너는 *낯선 자* 다. 화염의 벽 너머로 천 년의 약속이 *재가 되어* 흩날린다.',
  solwen_combat_hard_chant:
    '숲이 너의 서툰 부름에 *분노로 답한다*. 불길 속에서 영수의 비명과 너의 결정이 — *같은 음으로* 운다.',
  solwen_grief_canister:
    '흰 뿔이 무너진 자리에 *푸른 재* 가 쌓인다. 너는 인간을 이겼으나 — *지켜야 할 것* 을 너의 손으로 태웠다.',
  solwen_grief_shield:
    '영수가 너를 위해 *너의 침식* 을 나눠 가졌다. 흰 뿔에 번지는 푸른 빛 — 그것은 *너의 것이어야 했던* 저주다.',
  solwen_grief_canister_fail:
    '영수가 *너를 감싸며* 쓰러진다. 너의 화살은 늦었고 — 그 대가는 *너 아닌 자* 가 치렀다.',
  solwen_grief_shield_fail:
    '영수와 너의 피가 *같은 색* 으로 이끼를 적신다. 천 년의 약속이 — 이렇게, *함께 부서진다*.',
  climax_revolution_path_derail:
    '강철이 강철을 이긴 자리에서 너는 *그들 중 하나* 가 된다. 그러나 부서진 열차의 푸른 빛은 — 아직 *꺼지지 않았다*.',
  climax_revolution_path_hijack:
    '열차는 이제 너의 의지다. 매달린 의식 차량이 너의 *처분* 을 기다린다 — 부술 것인가, *사용* 할 것인가.',
  climax_fall_path_derail:
    '망치꾼들의 분노가 너를 향한다. 그러나 그들의 외침조차 — *지평선을 삼키는 푸른 빛* 앞에서는 무력하다.',
  climax_fall_path_hijack:
    '너의 손바닥 아래 유리가 *차갑게 식어간다*. 너무 깊이 침식된 결정이 — 세계와 함께 너를 *돌* 로 만든다.',
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'S',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );

  let updated = 0;
  let skipped = 0;
  for (const [id, extra] of Object.entries(ADDITIONS)) {
    const s = await Scene.findOne({ id }).lean();
    if (!s) {
      console.warn('skip(없음):', id);
      continue;
    }
    const body = [...(s.body ?? [])];
    if (body.length >= 3) {
      skipped++;
      continue;
    }
    body.push(extra);
    await Scene.findOneAndUpdate({ id }, { $set: { body } });
    console.log('updated:', id, `(${body.length}줄)`);
    updated++;
  }

  await mongoose.disconnect();
  console.log(`\n✓ seed-352 완료 — 갱신 ${updated} / 건너뜀(이미 3줄+) ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
