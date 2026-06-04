// 숲 깊은 곳 — 이끼 사이의 안경. 3 주차 미니 fix.
// forest_inner 의 wis 판정 ✓ 보상 — spirit_glasses 획득.
// 도트 자산 재사용 (elder-house placeholder).

import type { Scene } from "@/types/web-adventure";

export const forestFindGlasses: Scene = {
  id: "forest_find_glasses",
  illustration: "/web-adventure/scenes/forest.jpg",
  title: "이끼 사이의 안경",
  body: [
    "이끼 속에서 둥근 안경이 빛난다. 산신령의 것인가.",
    "안경을 집어 든다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "back_inner",
      label: "숲 깊은 곳으로 돌아간다",
      to: "forest_inner",
    },
  ],
  onEnter: { addItems: ["spirit_glasses"] },
};
