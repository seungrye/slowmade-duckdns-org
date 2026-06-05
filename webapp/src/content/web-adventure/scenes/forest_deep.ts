// 숲 더 깊이 — 4 주차 신규.
// forest_inner_with_glasses 에서의 추가 분기 (산신령 직행 외 *깊은 풍경* 탐색).
// 일러스트: 숲 재사용.

import type { Scene } from "@/types/web-adventure";

export const forestDeep: Scene = {
  id: "forest_deep",
  illustration: "/web-adventure/scenes/forest.jpg",
  title: "숲의 가장 깊은 곳",
  body: [
    "안경 너머로 본 길의 끝, 너는 *고대 나무* 앞에 선다.",
    "그 둥치 안에 새겨진 글자가 — 오래 전 누군가가 *마지막 인사* 처럼 남긴 것이 — 너의 마음에 깊이 박힌다.",
    "여기서 더 갈 길은 없다. 너는 다시 돌아간다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "back_inner_glasses",
      label: "안경 너머의 길로 돌아간다",
      to: "forest_inner_with_glasses",
    },
  ],
};
