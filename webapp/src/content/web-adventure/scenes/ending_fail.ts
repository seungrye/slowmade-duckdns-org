// 실패 엔딩 — 마을 추방 (4 주차 신규).
// market_caught → market_back_alley → 추방.

import type { Scene } from "@/types/web-adventure";

export const endingFail: Scene = {
  id: "ending_fail",
  illustration: "/web-adventure/scenes/market.jpg",
  title: "마을 추방 — 실패 엔딩",
  body: [
    "마을 어귀의 흙길에 너의 발자국 한 줄이 길게 늘어선다.",
    "박씨의 고함은 이미 그쳤지만 — 광장의 사람들의 시선은 너의 등 뒤에 남는다.",
    "*\"이 마을은 너를 잊을 것이다. 하지만 너는 이 마을을 결코 잊지 못할 것이다.\"*",
  ],
  choices: [],
  isEnding: true,
  endingId: "fail",
};
