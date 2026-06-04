// 마법서 채집 후 — onEnter 로 spellbook 추가.

import type { Scene } from "@/types/web-adventure";

export const caveAfterSpellbook: Scene = {
  id: "cave_after_spellbook",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "마법서를 챙겼다",
  body: [
    "낡은 마법서의 가죽 표지가 손에 잡힌다. 한 장을 펼치자 글자가 살짝 빛난다.",
    "지능이 한층 또렷해진 느낌이다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "back_to_cave",
      label: "동굴 안을 더 살핀다",
      to: "cave_inside",
    },
    {
      kind: "plain",
      id: "leave",
      label: "동굴 밖으로 나간다",
      to: "cave_entry",
    },
  ],
  onEnter: { addItems: ["spellbook"] },
};
