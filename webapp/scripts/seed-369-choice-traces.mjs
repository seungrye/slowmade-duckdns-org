#!/usr/bin/env node
// scripts/seed-369-choice-traces.mjs — #89 헛도는 판정을 걷고 선택의 흔적을 남긴다.
//
// 세 곳에서 선택이 사라지고 있었다.
//
//   omphalos_cameo   [설득]·[지혜] 가 probability 인데 성공·실패가 **같은 씬**으로 간다.
//                    주사위를 굴리게 해 놓고 결과가 같으니, 플레이어를 속이는 셈이다.
//   omphalos_tunnel  [혼자 간다] 도 마찬가지.
//   rin_evidence     [상급자 보고] 와 [신문사에 흘리고] 가 같은 씬으로 간다. 언론에 흘린
//                    사실이 어디에도 남지 않는다.
//
// 두 가지를 한다.
//   1) 결과가 갈리지 않는 probability → plain. 굴릴 이유가 없으면 굴리지 않는다.
//      곁들여 omphalos_cameo 의 노출 선택지가 5 개에서 3 개로 줄어 화면도 정리된다.
//   2) 선택마다 flag 를 남긴다(#89 의 선택지 setFlags). 도착 씬이 같아도 무엇을 골랐는지는
//      캐릭터에 남으므로, 뒤에서 조건부 선택지·서술로 회수할 수 있다.
//
// ⚠ 이 시드는 **흔적을 남기기까지**다. 그 flag 를 실제로 회수하는 장면은 아직 없다 —
//   별도 과제. 회수 전까지는 "선택이 사라지지는 않으나 아직 티가 나지도 않는" 상태다.
//
// 멱등: 같은 값을 다시 써도 mongo 가 변경으로 치지 않는다.

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('✗ MONGO_URI 필요');
  process.exit(2);
}

// 씬 → { 선택지 id → { toPlain?: 도착씬, setFlags } }
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
        // 판정을 걷어낸다 — 성공·실패가 같은 곳이면 굴릴 이유가 없다.
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
