// 숲 — 길을 잃음. 광장으로 수렴.

import type { Scene } from "@/types/web-adventure";

export const forestLost: Scene = {
  id: "forest_lost",
  illustration: "/web-adventure/scenes/elder-house.png",
  title: "숲 — 길을 잃다",
  body: [
    "안개가 짙어졌다. 발 밑이 보이지 않는다.",
    "한참을 헤맨 끝에, 겨우 익숙한 풍경이 나타났다. 광장으로 돌아왔다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "back",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
};
