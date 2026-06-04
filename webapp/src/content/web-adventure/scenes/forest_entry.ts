// 숲 입구 — 비밀 엔딩(산신령) 트리거 씬.
// 일러스트는 elder-house.png 재사용 (카테고리 추가 자산은 3 주차+).

import type { Scene } from "@/types/web-adventure";

export const forestEntry: Scene = {
  id: "forest_entry",
  illustration: "/web-adventure/scenes/forest.jpg",
  title: "안개 자욱한 숲 입구",
  body: [
    "마을 외곽의 숲 입구. 안개가 무릎까지 올라온다.",
    "무언가 — 산신령의 기운 같은 것 — 깊은 곳에서 흘러나온다.",
  ],
  choices: [
    {
      kind: "probability",
      id: "meet_spirit",
      label: "산신령을 찾아 깊숙이 들어간다",
      stat: "wis",
      difficulty: 13,
      onSuccess: "ending_spirit",
      onFailure: "forest_lost",
    },
    {
      // 3 주차: 깊은 숲 (forest_inner) — 안경 분기로 이어진다.
      kind: "plain",
      id: "go_deeper",
      label: "숲 안쪽으로 더 들어간다",
      to: "forest_inner",
    },
    {
      kind: "plain",
      id: "back_from_forest",
      label: "왔던 길을 돌아간다",
      to: "town_square_dawn",
    },
  ],
};
