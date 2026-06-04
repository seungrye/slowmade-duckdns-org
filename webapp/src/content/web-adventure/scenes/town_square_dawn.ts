// 마을 광장의 새벽 — 모험의 출발점이자 분기 허브.
// 2 주차에 1 주차의 *모두 elder_ending 수렴* 구조를 폐기.
// 세 갈래 (시장 / 장로의 집 / 숲) 로 확장.

import type { Scene } from "@/types/web-adventure";

export const townSquareDawn: Scene = {
  id: "town_square_dawn",
  illustration: "/web-adventure/scenes/town-square-dawn.jpg",
  title: "마을 광장의 새벽",
  body: [
    "회색빛 하늘 아래, 마을 광장에 첫 햇살이 닿는다.",
    "장로의 집에서 무거운 부탁이 있다고 들었지만, 발길은 자꾸 다른 곳으로 향한다.",
  ],
  choices: [
    { kind: "plain", id: "to_market", label: "시장을 살핀다", to: "market_morning" },
    {
      kind: "plain",
      id: "to_elder_house",
      label: "장로의 집으로 향한다",
      to: "elder_house_arrival",
    },
    { kind: "plain", id: "to_forest", label: "숲으로 향한다", to: "forest_entry" },
    { kind: "plain", id: "to_cave", label: "산기슭 동굴로 향한다", to: "cave_entry" },
  ],
};
