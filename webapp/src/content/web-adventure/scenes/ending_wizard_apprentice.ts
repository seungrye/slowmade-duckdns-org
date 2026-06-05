// 마법사 제자 엔딩 — 4 주차 신규.
// wizard_meeting 에서 int 13 ✓ 시.

import type { Scene } from "@/types/web-adventure";

export const endingWizardApprentice: Scene = {
  id: "ending_wizard_apprentice",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "마법사의 제자 — 비밀 엔딩",
  body: [
    "마법사는 자리에서 일어나 너의 어깨에 손을 얹는다.",
    "*\"좋아. 글자를 *살리는 자* 의 길에 자네를 두지.\"*",
    "오두막 한쪽 책상이 너의 자리가 된다. 산기슭의 안개와 마법서의 빛이 너의 새 일상이 된다.",
  ],
  choices: [],
  isEnding: true,
  endingId: "wizard_apprentice",
};
