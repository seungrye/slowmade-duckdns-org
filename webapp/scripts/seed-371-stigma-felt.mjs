#!/usr/bin/env node
// scripts/seed-371-stigma-felt.mjs - #160: making the contamination felt in the body.
//
// The run feedback notes said **the same thing across two different runs**:
//
//   "Kael's contamination is at its maximum of 100, yet the physical and psychological effects are not
//    shown enough. The felt change at each stage should be described more concretely."
//   "At the moment of the blackout, or when deciding in front of the train, lines or situations could be added that show
//    the protagonist's inner conflict and psychological burden more strongly."
//
// The number rises but the prose does not say so - the system and the narration ran apart.
//
// The fix: put **derived variables** like `{{침식_손}}` in the body (lib/web-adventure/stigma-sense).
// As the contamination rises, the same sentence grows heavier by itself. A different sense is chosen per scene (hand, sight, breath, mind)
// so it does not repeat like wallpaper.
//
//   "It spills into the corridor. {{침식_손}}"
//     contamination 0   -> "…your fingertips are a little cold."
//     contamination 100 -> "…your stiffened fingers will not bend. You have to push with the back of your hand."
//
// The two scenes the notes pointed at (the blackout's afterimage, and before the transport container) get the **mind** sense, so the inner conflict
// grows heavier along with the contamination.
//
// Idempotent: a paragraph that already carries a variable is left alone.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

// scene -> [the paragraph index, the sentence to append]
// One sentence is joined to the end of a paragraph. A new paragraph is not made, so the reveal's
// paragraph-by-paragraph rhythm is not disturbed.
const PLAN = {
  // The start - a scene about the crystals in the arm. Opened with the hand.
  kael_infirmary: [[1, '{{침식_손}}']],
  // Moving - bare feet and a stiffened body. Toes are already described, so the hand takes it up without overlapping.
  kael_corridor: [[0, '{{침식_손}}']],
  // The blackout - a scene the notes named. The inner life at the moment of seeing your own light in the dark.
  kael_corridor_spark: [[2, '{{침식_마음}}']],
  // The hand holding the scalpel - the hand.
  kael_corridor_blade: [[1, '{{침식_손}}']],
  // After the forgery succeeds - breath, where the tension eases.
  kael_corridor_clear: [[2, '{{침식_숨}}']],
  // The decision before the container - a scene the notes named. The burden of weighing whether to jump in.
  kael_cargo_container: [[2, '{{침식_마음}}']],
  // Right after the fall - breath, where the body is raised.
  kael_falling: [[3, '{{침식_숨}}']],
  // The knees have stiffened - the name itself is contamination. Taken up by the hand.
  kael_falling_aftermath: [[2, '{{침식_손}}']],
  // The wreckage field - sight, where a wide place is surveyed.
  kael_wreckage_hub: [[1, '{{침식_시야}}']],
  // The cargo manifest - a scene of reading letters, so sight bites hardest.
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
      // A paragraph already carrying any contamination variable is left alone (safe to rerun).
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
