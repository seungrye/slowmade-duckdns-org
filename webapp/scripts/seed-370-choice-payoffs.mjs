#!/usr/bin/env node
// scripts/seed-370-choice-payoffs.mjs - #107: paying the traces back in the story.
//
// #89 made each choice leave a flag, but no scene took them up. Three are paid off here.
// No scenes are added - one conditional choice each.
//
// The screen must not exceed three choices (#262), so the slots are **swapped**.
//   The existing roll choice is hidden with hideWhenFlag and the conditional takes its place.
//   So someone carrying the trace sees "the road that opens without a roll", and someone without it sees the roll as before.
//
//   cameoAlly       you agreed to go on with the kindred spirit met in the alley
//                   -> they take the far ring in climax_harmony_path. A success without a roll.
//                     (this scene shows only one choice, so no slot needs freeing)
//   tunnelDebt      you paid a secret for the guide through the mine
//                   -> that tie lets you know the back door. It replaces the dexterity roll's slot.
//   leakedToPress   you leaked the evidence to the press first
//                   -> it becomes a card in front of Hoffmann. It replaces the persuasion roll's slot.
//
// Idempotent: the choice with the same id is swapped in, so a second run gives the same result.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

/** The road that opens to someone carrying the trace. */
const PAYOFFS = {
  // It was meant for climax_harmony_path, but that scene already had 6 choices, at the authoring pool's cap (lint.ts's
  // maxChoices). The steel road is a natural place for "splitting it between two" as well.
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
    // The secret you sold bought you the back door - no roll.
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

  // Removing what an earlier run put into climax_harmony_path (that scene is at the pool's cap).
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
