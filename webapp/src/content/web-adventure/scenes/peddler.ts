// 행상인 — 4 주차 신규.
// 광장 옆에 자리잡은 떠돌이 상인. cha 11 ✓ 시 영수증 획득.
// *시장 정착* 을 선택하면 shopkeeper 엔딩.
// 일러스트: 시장 재사용.

import type { Scene } from "@/types/web-adventure";

export const peddler: Scene = {
  id: "peddler",
  illustration: "/web-adventure/scenes/market.jpg",
  title: "광장 옆 — 떠돌이 행상인",
  body: [
    "광장 한쪽, 박씨의 좌판과 멀찍이 떨어진 자리에 떠돌이 행상인이 보따리를 펼친다.",
    "그는 너에게 *영수증 한 장* 과 *낡은 두루마리* 를 흔들어 보이며 — 너의 말솜씨를 시험하려는 듯한 미소를 짓는다.",
    "그가 마지막으로 묻는다 — *\"자네, 혹시 좌판 한 번 펴 볼 생각 없는가?\"*",
  ],
  choices: [
    {
      kind: "probability",
      id: "try_charm",
      label: "말솜씨로 영수증을 받아 낸다",
      stat: "cha",
      difficulty: 11,
      onSuccess: "peddler_success",
      onFailure: "town_square_dawn",
    },
    {
      kind: "plain",
      id: "settle_market",
      label: "시장에 정착한다 — 좌판을 펴겠다고 답한다",
      to: "ending_shopkeeper",
    },
    {
      kind: "plain",
      id: "leave_peddler",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
};
