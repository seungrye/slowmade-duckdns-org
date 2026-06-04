// 시장 비밀 창고 잠입 — 실패 분기.
// caughtBefore 플래그 부여 (3 주차 이후 NPC 호감도 / 추가 분기에 활용).

import type { Scene } from "@/types/web-adventure";

export const marketCaught: Scene = {
  id: "market_caught",
  illustration: "/web-adventure/scenes/town-square-dawn.png",
  title: "시장 — 들켰다",
  body: [
    "허튼 발걸음에 좌판이 흔들렸다. 박씨의 고함이 시장 전체에 울린다.",
    "쫓기듯 광장 쪽으로 도망쳤다. 누군가 너를 노려보고 있는 것 같다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "retreat",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
  onEnter: { setFlags: { caughtBefore: true } },
};
