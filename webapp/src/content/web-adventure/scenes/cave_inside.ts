// 동굴 안 — 3 주차 신규.
// 마법서 채집 + 도깨비 조우 분기.

import type { Scene } from "@/types/web-adventure";

export const caveInside: Scene = {
  id: "cave_inside",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "동굴 안 — 마법서와 그림자",
  body: [
    "횃불의 빛이 닿자, 동굴의 벽이 푸르게 반짝인다.",
    "한쪽 구석에는 *낡은 마법서* 가 놓여 있고, 더 깊은 곳에서는 누군가 — *도깨비* 인 듯한 — 그림자가 움직인다.",
  ],
  choices: [
    {
      // 5 주차 (#221) — 한 번 챙긴 후 자동 숨김.
      kind: "conditional",
      id: "take_spellbook",
      label: "마법서를 챙긴다",
      condition: { kind: "flag", key: "spellbookTaken", expect: false },
      to: "cave_after_spellbook",
      hidden: true,
    },
    {
      kind: "probability",
      id: "meet_goblin",
      label: "도깨비에게 다가간다",
      stat: "cha",
      difficulty: 12,
      onSuccess: "goblin_encounter",
      onFailure: "cave_entry",
    },
    {
      kind: "plain",
      id: "leave_cave",
      label: "동굴 밖으로 나간다",
      to: "cave_entry",
    },
  ],
};
