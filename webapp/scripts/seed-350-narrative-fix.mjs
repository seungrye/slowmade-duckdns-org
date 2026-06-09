#!/usr/bin/env node
// scripts/seed-350-narrative-fix.mjs — #350 시나리오 추가 보강.
//
// 외부 검토자 의견 2 (P0 + P1 옵션 B):
//   P0: station_path_steel 의 derail 분기 = '탈선' → '강제 정차/나포' 의미.
//       그 후 climax_revolution_path 의 *온전한 열차 사용* 과 모순 해소.
//   P1: omphalos_infiltration 의 onFailure = kael_caught_minor 였음.
//       '카엘 발각 씬' 이라 *린/솔벤* 진입 시 ID 혼선.
//       신규 omphalos_caught_at_gate 신설 — 주어 중립 발각 씬.
//
// 두 변경 모두 idempotent: findOneAndUpdate \$set / upsert.
// illustration 보호 가드 적용 (real URL 이면 보존).

import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'S',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );

  // ── P0: station_path_steel — derail/hijack 라벨 갱신 ───────────────────
  const sp = await Scene.findOne({ id: 'station_path_steel' }).lean();
  if (sp) {
    const newChoices = sp.choices.map((c) => {
      if (c.id === 'derail') {
        return {
          ...c,
          label:
            '[완력] 선로 전환기를 *강제 고정* — 열차를 정거장에 *강제 정차* 시켜 *나포* 한다.',
        };
      }
      if (c.id === 'hijack') {
        return {
          ...c,
          label: '[지능] 제어실을 해킹 — 열차의 제어권을 *온전히* 빼앗는다.',
        };
      }
      return c;
    });
    await Scene.findOneAndUpdate(
      { id: 'station_path_steel' },
      { $set: { choices: newChoices } },
    );
    console.log('updated: station_path_steel — derail/hijack 라벨 갱신');
  }

  // ── P1: omphalos_caught_at_gate 신설 ─────────────────────────────────
  const NEW_SCENE = {
    id: 'omphalos_caught_at_gate',
    illustration: '/web-adventure/scenes/placeholder-square.svg',
    title: 'Scene 06i-fail — 게이트의 손',
    body: [
      '옴팔로스 게이트의 경비병이 *너의 팔* 을 잡았다. *위조 시민증* 이 손에서 떨어진다.',
      '"사제단의 정제소로 — 산 채로 인계되는 마지막 가솔린."',
      '너의 외투 안 *인장* / *권총* / *깃털* 도 — 모두 빼앗긴다. 너는 묶인 채 *호송 열차의 화물칸* 으로 끌려간다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'surrender_to_refinery',
        label: '저항할 힘이 — 남아있지 않다.',
        to: 'ending_petrification',
      },
    ],
    onEnter: { hpDelta: -5, stigmaDelta: 4 },
  };
  const curGate = await Scene.findOne({ id: NEW_SCENE.id }).lean();
  const update = { ...NEW_SCENE };
  // illustration 보호 — painter 가 실 URL 생성한 경우 유지.
  if (curGate && curGate.illustration && !curGate.illustration.includes('placeholder')) {
    update.illustration = curGate.illustration;
  }
  await Scene.findOneAndUpdate({ id: NEW_SCENE.id }, update, { upsert: true, new: true });
  console.log('upsert:', NEW_SCENE.id);

  // ── omphalos_infiltration.onFailure 재지정 ────────────────────────────
  const inf = await Scene.findOne({ id: 'omphalos_infiltration' }).lean();
  if (inf) {
    const newInfChoices = inf.choices.map((c) => {
      if (c.onFailure === 'kael_caught_minor') {
        return { ...c, onFailure: 'omphalos_caught_at_gate' };
      }
      return c;
    });
    await Scene.findOneAndUpdate(
      { id: 'omphalos_infiltration' },
      { $set: { choices: newInfChoices } },
    );
    console.log('updated: omphalos_infiltration — onFailure (kael_caught_minor → omphalos_caught_at_gate)');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
