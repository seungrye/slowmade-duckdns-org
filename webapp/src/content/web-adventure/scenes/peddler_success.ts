// 행상인 카리스마 판정 성공 — 영수증 획득 후 광장 복귀.
// 4 주차 신규.

import type { Scene } from "@/types/web-adventure";

export const peddlerSuccess: Scene = {
  id: "peddler_success",
  illustration: "/web-adventure/scenes/market.jpg",
  title: "행상인 — 영수증",
  body: [
    "행상인이 손을 풀고 영수증을 너에게 건넨다.",
    "*\"이거 한 장이면, 자네가 *정당하게 산 자* 라는 증거가 되네.\"* 그는 의미심장하게 웃는다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "back_to_square_from_peddler",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
  onEnter: { addItems: ["market_receipt"] },
};
