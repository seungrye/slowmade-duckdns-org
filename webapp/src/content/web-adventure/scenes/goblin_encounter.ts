// 도깨비 조우 — 카리스마 판정으로 친구 / 적 갈림.

import type { Scene } from "@/types/web-adventure";

export const goblinEncounter: Scene = {
  id: "goblin_encounter",
  illustration: "/web-adventure/scenes/elder-house.png",
  title: "도깨비 — 작은 친구",
  body: [
    "도깨비는 작고, 의외로 둥근 얼굴을 하고 있다.",
    "그는 너의 손을 한참 보다가 — *\"같이 갈래?\"* 하고 묻는다.",
  ],
  choices: [
    {
      kind: "probability",
      id: "befriend_goblin",
      label: "도깨비의 손을 잡는다",
      stat: "cha",
      difficulty: 12,
      onSuccess: "ending_goblin_friend",
      onFailure: "cave_inside",
    },
    {
      kind: "plain",
      id: "decline_goblin",
      label: "정중히 거절한다",
      to: "cave_inside",
    },
  ],
};
