// 장로의 집 도착 — 메인 엔딩 분기점.
// hasSecretSnack flag 가 있어야 give_snack 선택지가 활성화된다.

import type { Scene } from "@/types/web-adventure";

export const elderHouseArrival: Scene = {
  id: "elder_house_arrival",
  illustration: "/web-adventure/scenes/elder-house.png",
  title: "장로의 집 앞",
  body: [
    "낡은 나무 문이 살짝 열려 있다. 안에서는 차 끓이는 향이 새어 나온다.",
    "장로의 목소리가 들린다 — *\"누구든 들어오시게.\"*",
  ],
  choices: [
    {
      kind: "conditional",
      id: "give_snack",
      label: "비밀 간식을 전한다",
      condition: { kind: "flag", key: "hasSecretSnack" },
      to: "ending_main",
    },
    {
      kind: "plain",
      id: "back_square",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
};
