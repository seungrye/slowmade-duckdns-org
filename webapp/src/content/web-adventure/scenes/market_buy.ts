// 시장 — 좌판 구매. 3 주차 미니 fix.
// 박씨가 자리 비운 사이 빵·횃불·약초를 한 번에 챙긴다.
// 도트 자산 재사용 (town-square-dawn).

import type { Scene } from "@/types/web-adventure";

export const marketBuy: Scene = {
  id: "market_buy",
  illustration: "/web-adventure/scenes/market.jpg",
  title: "시장의 좌판 — 물건 구매",
  body: [
    "박씨가 잠깐 자리를 비운 사이, 좌판을 살펴본다.",
    "마침 빵, 횃불, 약초가 보인다. 누가 보든 말든 한 번에 챙긴다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "back_to_square",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
  onEnter: { addItems: ["bread", "torch", "herb"] },
};
