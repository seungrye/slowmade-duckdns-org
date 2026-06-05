// 숲 깊은 곳 — 안경을 통해 본 신성한 광경. 산신령 엔딩 직행 또는 *더 깊이* 분기.
// 4 주차: forest_deep 분기 추가.

import type { Scene } from "@/types/web-adventure";

export const forestInnerWithGlasses: Scene = {
  id: "forest_inner_with_glasses",
  illustration: "/web-adventure/scenes/forest.jpg",
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
    {
      kind: "plain",
      id: "go_to_forest_deep",
      label: "은빛 길의 *더 깊은 곳* 으로 향한다",
      to: "forest_deep",
    },
  ],
};
