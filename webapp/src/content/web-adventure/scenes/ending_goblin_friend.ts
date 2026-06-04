// 도깨비 친구 엔딩 — 3 주차 신규.
// onEnter 로 goblin_charm 부여 — 엔딩 후 캐릭터에 흔적.

import type { Scene } from "@/types/web-adventure";

export const endingGoblinFriend: Scene = {
  id: "ending_goblin_friend",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "도깨비의 친구 — 엔딩",
  body: [
    "도깨비는 너에게 작은 부적을 건넨다 — *\"이건 우리 표시야.\"*",
    "너는 마을로 돌아가지 않고, 도깨비와 함께 *동굴 속 또 다른 길* 로 향한다.",
  ],
  choices: [],
  isEnding: true,
  endingId: "goblin_friend",
  onEnter: { addItems: ["goblin_charm"] },
};
