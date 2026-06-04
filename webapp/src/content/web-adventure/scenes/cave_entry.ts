// 동굴 입구 — 3 주차 신규.
// 어둠 때문에 그냥은 들어갈 수 없다. 횃불 필요.

import type { Scene } from "@/types/web-adventure";

export const caveEntry: Scene = {
  id: "cave_entry",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "동굴 입구 — 칠흑의 어둠",
  body: [
    "산기슭에 자리한 검은 동굴. 입구에서부터 한기가 흘러 나온다.",
    "안쪽은 칠흑같이 어두워, 어떤 빛도 닿지 않는다.",
  ],
  choices: [
    {
      // torch 보유 시 진입 가능.
      kind: "conditional",
      id: "enter_with_torch",
      label: "횃불을 들고 들어간다",
      condition: { kind: "hasItem", itemId: "torch" },
      to: "cave_inside",
    },
    {
      kind: "plain",
      id: "back_from_cave",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
};
