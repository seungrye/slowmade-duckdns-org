// 동료 카리스마 판정 성공 — 동행 증표 획득 후 광장 복귀.
// 4 주차 신규.

import type { Scene } from "@/types/web-adventure";

export const companionSuccess: Scene = {
  id: "companion_success",
  illustration: "/web-adventure/scenes/town-square-dawn.jpg",
  title: "동행의 증표",
  body: [
    "그가 너의 손을 잡고 작은 *동행 증표* 를 건넨다.",
    "*\"이거 가지고 있으면, 어디서든 내가 너의 부름을 들을 수 있을 거야.\"*",
  ],
  choices: [
    {
      kind: "plain",
      id: "back_to_square_with_token",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
  onEnter: { addItems: ["companion_token"] },
};
