// 동굴 보물 분기 — 4 주차 신규.
// cave_after_spellbook 에서 추가 분기. 보물 한 점을 챙긴다 (낡은 두루마리).
// 일러스트: 동굴 재사용.

import type { Scene } from "@/types/web-adventure";

export const caveTreasure: Scene = {
  id: "cave_treasure",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "동굴 보물 — 낡은 두루마리",
  body: [
    "마법서 옆 작은 틈에서 둥글게 말린 *낡은 두루마리* 가 보인다.",
    "글자는 절반쯤 지워졌지만, 손끝으로 만지자 *그림자 형상* 이 잠시 보였다 사라진다.",
    "신중하게 챙긴다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "back_to_after_spellbook",
      label: "마법서 자리로 돌아간다",
      to: "cave_after_spellbook",
    },
  ],
  onEnter: { addItems: ["scroll"] },
};
