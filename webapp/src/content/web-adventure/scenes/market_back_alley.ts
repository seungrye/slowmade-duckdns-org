// 시장 뒷골목 — 4 주차 신규.
// market_caught 에서 caughtCount 3 이상일 때 hidden conditional 로 노출.
// 결국 ending_fail 로 이어진다 (추방).
// 일러스트: 시장 재사용.

import type { Scene } from "@/types/web-adventure";

export const marketBackAlley: Scene = {
  id: "market_back_alley",
  illustration: "/web-adventure/scenes/market.jpg",
  title: "시장 뒷골목 — 어둠 속의 의심",
  body: [
    "박씨의 외침이 멀어진다. 너는 좁은 뒷골목으로 몸을 숨긴다.",
    "벽 곳곳에 의심의 눈초리가 묻어 있다. 마을 사람들이 이미 너의 이름을 *훔치는 자* 로 부르기 시작했다는 소문이 들린다.",
    "이제 너에게 남은 길은 — 마을을 떠나는 것뿐.",
  ],
  choices: [
    {
      kind: "plain",
      id: "to_fail",
      label: "마을을 떠난다",
      to: "ending_fail",
    },
  ],
};
