#!/usr/bin/env node
// scripts/seed-370-choice-payoffs.mjs — #107 남긴 흔적을 이야기에서 되돌려 준다.
//
// #89 에서 선택마다 flag 를 남기게 했지만 그것을 받아 주는 장면이 없었다. 셋을 회수한다.
// 씬은 늘리지 않는다 — 조건부 선택지 하나씩이다.
//
// 화면 선택지는 셋을 넘지 않아야 하므로(#262), 자리를 **바꿔치기** 한다.
//   기존 판정 선택지에 hideWhenFlag 를 걸어 숨기고, 그 자리에 조건부를 넣는다.
//   그래서 흔적이 있는 사람은 「판정 없이 통하는 길」을, 없는 사람은 종전의 판정을 본다.
//
//   cameoAlly       골목에서 만난 동류와 함께 가기로 했다
//                   → climax_harmony_path 에서 반대편 고리를 맡아 준다. 굴리지 않고 성공.
//                     (이 씬은 노출 선택지가 하나뿐이라 자리를 비울 필요가 없다)
//   tunnelDebt      갱도 안내에 비밀을 값으로 냈다
//                   → 그 연으로 뒷문을 안다. [민첩] 판정 자리를 대신한다.
//   leakedToPress   증거를 언론에 먼저 흘렸다
//                   → 호프만 앞에서 패가 된다. [언변] 판정 자리를 대신한다.
//
// 멱등: 같은 id 의 선택지를 갈아끼우므로 두 번 돌려도 결과가 같다.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

/** 흔적을 가진 사람에게 열리는 길. */
const PAYOFFS = {
  // climax_harmony_path 에 두려 했으나 그 씬은 이미 선택지 6 개로 저작 pool 상한(lint.ts
  // maxChoices)에 닿아 있었다. 강철의 길도 「둘이 나눠 맡는다」가 자연스러운 자리다.
  station_path_steel: {
    hideWhenFlagOn: { choiceId: 'derail', flag: 'cameoAlly' },
    add: {
      kind: 'conditional',
      id: 'cameo_ally_lever',
      label: '[함께 온 자] 골목에서 만난 이가 반대편 레버를 잡는다.',
      to: 'climax_revolution_path_derail',
      hidden: true,
      condition: { kind: 'flag', key: 'cameoAlly' },
    },
  },
  omphalos_infiltration: {
    // 비밀을 판 값으로 뒷문을 안다 — 굴리지 않는다.
    hideWhenFlagOn: { choiceId: 'sneak_in', flag: 'tunnelDebt' },
    add: {
      kind: 'conditional',
      id: 'tunnel_debt_backdoor',
      label: '[갱도의 연] 비밀을 산 자가 뒷문을 일러 준다.',
      to: 'omphalos_arrival_stealth',
      hidden: true,
      condition: { kind: 'flag', key: 'tunnelDebt' },
    },
  },
  rin_betrayal: {
    hideWhenFlagOn: { choiceId: 'talk_down', flag: 'leakedToPress' },
    add: {
      kind: 'conditional',
      id: 'press_leverage',
      label: '[이미 밖으로] 기사는 곧 나간다 — 쏘아도 늦었다.',
      to: 'rin_underground_talk',
      hidden: true,
      condition: { kind: 'flag', key: 'leakedToPress' },
    },
  },
};

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');
  let touched = 0;

  // 앞선 판에서 climax_harmony_path 에 넣었던 것을 걷어낸다(그 씬은 pool 상한에 닿아 있다).
  const stale = await col.findOne({ id: 'climax_harmony_path' });
  if (stale && (stale.choices || []).some((c) => c.id === 'cameo_ally_hands')) {
    await col.updateOne(
      { id: 'climax_harmony_path' },
      { $set: { choices: stale.choices.filter((c) => c.id !== 'cameo_ally_hands') } },
    );
    console.log('  - climax_harmony_path 의 옛 cameo_ally_hands 제거');
  }

  for (const [sceneId, plan] of Object.entries(PAYOFFS)) {
    const scene = await col.findOne({ id: sceneId });
    if (!scene) { console.warn(`  - 씬 없음: ${sceneId}`); continue; }

    let choices = (scene.choices || []).map((c) => {
      const h = plan.hideWhenFlagOn;
      if (h && c.id === h.choiceId) return { ...c, hideWhenFlag: h.flag };
      return c;
    });

    if (plan.hideWhenFlagOn && !choices.some((c) => c.id === plan.hideWhenFlagOn.choiceId)) {
      console.warn(`  - 자리를 비울 선택지를 못 찾음: ${sceneId}.${plan.hideWhenFlagOn.choiceId}`);
    }

    choices = choices.filter((c) => c.id !== plan.add.id).concat([plan.add]);

    const r = await col.updateOne({ id: sceneId }, { $set: { choices } });
    if (r.modifiedCount) touched++;
  }

  console.log(`seed-370-choice-payoffs: 변경 ${touched}개 씬`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-370-choice-payoffs 실패:', e.message);
  process.exit(1);
});
