#!/usr/bin/env node
// scripts/seed-369-choice-traces.mjs - #89: removing the idle rolls and leaving a trace of the choice.
//
// In three places a choice was vanishing.
//
//   omphalos_cameo   persuasion and wisdom are probability choices whose success and failure lead to **the same scene**.
//                    Making the player roll and then giving the same result deceives them.
//   omphalos_tunnel  going alone is the same.
//   rin_evidence     reporting to a superior and leaking to the press lead to the same scene. That the leak happened
//                    is recorded nowhere.
//
// Two things are done.
//   1) a probability whose outcomes do not diverge becomes plain. With no reason to roll, nothing is rolled.
//      As a bonus, omphalos_cameo's visible choices drop from 5 to 3 and the screen is tidier.
//   2) each choice leaves a flag (#89's per-choice setFlags). Even when the destination is the same, what was chosen
//      stays on the character and can be paid off later through conditional choices and narration.
//
// Note: this seed goes only as far as **leaving the trace**. No scene actually pays those flags off yet -
//   that is a separate task. Until then the state is "the choice no longer vanishes, but it does not show either".
//
// Idempotent: writing the same value again is not counted as a change by mongo.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

// scene -> { choice id -> { toPlain?: the destination scene, setFlags } }
const PLAN = {
  omphalos_cameo: {
    persuade_join: { toPlain: 'omphalos_station', setFlags: { metCameo: true, cameoAlly: true } },
    exchange_intel: { toPlain: 'omphalos_station', setFlags: { metCameo: true, cameoRead: true } },
    hecate_illusion: { setFlags: { metCameo: true, cameoVanished: true } },
  },
  omphalos_tunnel: {
    follow_smuggler: { setFlags: { tunnelDebt: true } },
    go_alone: { toPlain: 'omphalos_plaza', setFlags: { tunnelAlone: true } },
  },
  rin_evidence: {
    to_supervisor: { setFlags: { reportedToSupervisor: true } },
    to_press: { setFlags: { leakedToPress: true } },
  },
};

const main = async () => {
  await mongoose.connect(MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurescenes');
  let touched = 0;

  for (const [sceneId, plan] of Object.entries(PLAN)) {
    const scene = await col.findOne({ id: sceneId });
    if (!scene) { console.warn(`  - 씬 없음: ${sceneId}`); continue; }

    const choices = (scene.choices || []).map((c) => {
      const p = plan[c.id];
      if (!p) return c;
      const next = { ...c, setFlags: p.setFlags };
      if (p.toPlain) {
        // The roll is removed - with success and failure in the same place there is no reason to roll.
        next.kind = 'plain';
        next.to = p.toPlain;
        delete next.stat; delete next.difficulty;
        delete next.onSuccess; delete next.onFailure;
      }
      return next;
    });

    const r = await col.updateOne({ id: sceneId }, { $set: { choices } });
    if (r.modifiedCount) touched++;
  }

  console.log(`seed-369-choice-traces: 변경 ${touched}개 씬`);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error('✗ seed-369-choice-traces 실패:', e.message);
  process.exit(1);
});
