// 장로의 집 — PoC 엔딩 씬. 1 주차에서는 모든 분기가 여기로 수렴.

import type { Scene } from "@/types/web-adventure";

export const elderEnding: Scene = {
  id: "elder_ending",
  illustration: "/web-adventure/scenes/elder-house.png",
  title: "장로의 집",
  body: [
    "장로의 집 문을 두드린다. 안에서 사람이 부스럭거리는 소리가 난다.",
    "(여기까지가 PoC. 본 게임은 곧 만들어진다.)",
  ],
  choices: [],
  isEnding: true,
  endingId: "main",
};
