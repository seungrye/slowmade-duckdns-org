// 마을 광장의 새벽 — 모험의 출발점이자 분기 허브.
// 2 주차: 세 갈래 (시장 / 장로집 / 숲) 확장.
// 4 주차: 산기슭 / 행상인 / 동료 분기 추가 → 6 선택지.

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
    {
      kind: "plain",
      id: "to_mountain_foot",
      label: "산기슭의 바위 길로 향한다",
      to: "mountain_foot",
    },
    { kind: "plain", id: "to_peddler", label: "광장 옆 행상인에게 다가간다", to: "peddler" },
    {
      kind: "plain",
      id: "to_companion",
      label: "광장 가장자리의 동행자를 본다",
      to: "companion_meeting",
    },
  ],
};
