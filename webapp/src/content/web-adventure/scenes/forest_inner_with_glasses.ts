// 숲 깊은 곳 — 안경을 통해 본 신성한 광경. 산신령 엔딩 직행.

import type { Scene } from "@/types/web-adventure";

export const forestInnerWithGlasses: Scene = {
  id: "forest_inner_with_glasses",
  illustration: "/web-adventure/scenes/elder-house.png",
  title: "산신령의 길 — 보이지 않던 것",
  body: [
    "안경 너머로, 안개 사이에 *은빛 길* 이 분명히 드러난다.",
    "그 끝에서 늙은 산신령이 너를 기다리고 있다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "meet_spirit_directly",
      label: "산신령에게 다가간다",
      to: "ending_spirit",
    },
  ],
};
