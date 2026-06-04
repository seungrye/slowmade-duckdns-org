// 숲 깊은 곳 — 3 주차 신규.
// 일반적인 길은 *위험* 하지만, *산신령의 안경* 보유 시 *신성한 길* 이 열린다.
// 일러스트: 기존 elder-house.png 재사용 (도트 자산 4 주차 작업).

import type { Scene } from "@/types/web-adventure";

export const forestInner: Scene = {
  id: "forest_inner",
  illustration: "/web-adventure/scenes/elder-house.png",
  title: "숲 깊은 곳 — 산신령의 흔적",
  body: [
    "안개가 더 짙어진다. 발걸음이 점점 무거워진다.",
    "어디선가 옅은 빛이 새어 나오는 듯하지만 — 평범한 눈으로는 보이지 않는다.",
  ],
  choices: [
    {
      // 안경 보유 시 *신성한 광경* 분기.
      kind: "conditional",
      id: "see_with_glasses",
      label: "안경 너머의 빛을 따라간다",
      condition: { kind: "hasItem", itemId: "spirit_glasses" },
      to: "forest_inner_with_glasses",
    },
    {
      // 3 주차 미니 fix — wis 10 판정 ✓ 시 안경 획득 씬으로.
      kind: "probability",
      id: "look_around",
      label: "주변을 살핀다",
      stat: "wis",
      difficulty: 10,
      onSuccess: "forest_find_glasses",
      onFailure: "forest_inner",
    },
    {
      // 안경 없을 때의 *지혜 판정* (난이도 13, 안경 없으면 어렵다).
      kind: "probability",
      id: "search_blindly",
      label: "감각만으로 깊숙이 들어간다",
      stat: "wis",
      difficulty: 13,
      onSuccess: "ending_spirit",
      onFailure: "forest_lost",
    },
    {
      kind: "plain",
      id: "back_to_entry",
      label: "왔던 길로 돌아간다",
      to: "forest_entry",
    },
  ],
};
