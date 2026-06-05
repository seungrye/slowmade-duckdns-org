// 마법사 오두막 — 산기슭 분기의 종착점 (4 주차 신규).
// 마법사가 너의 지능을 시험한다. int 13 ✓ 시 *제자* 가 되어 wizard_apprentice 엔딩.
// 일러스트: 동굴 재사용.

import type { Scene } from "@/types/web-adventure";

export const wizardMeeting: Scene = {
  id: "wizard_meeting",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "마법사의 오두막 — 시험",
  body: [
    "오두막 안은 책더미와 약초로 가득하다. 늙은 마법사가 책상 앞에 앉아 너를 바라본다.",
    "그는 짧게 묻는다 — *\"글자를 *읽는* 것과 *살리는* 것의 차이를 아는가?\"*",
    "너의 대답이 그의 마음을 사로잡으면 — 그는 너에게 마법서를 건넬 것이다.",
  ],
  choices: [
    {
      kind: "probability",
      id: "become_apprentice",
      label: "마법사의 질문에 답한다",
      stat: "int",
      difficulty: 13,
      onSuccess: "ending_wizard_apprentice",
      onFailure: "mountain_foot",
    },
    {
      kind: "plain",
      id: "decline_wizard",
      label: "정중히 물러난다",
      to: "mountain_foot",
    },
  ],
  onEnter: { addItems: ["spellbook"] },
};
