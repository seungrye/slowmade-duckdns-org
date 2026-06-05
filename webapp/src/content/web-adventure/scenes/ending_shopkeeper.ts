// 정착 엔딩 — 시장의 새 주인 (4 주차 신규).
// peddler 에서 *settle_market* 선택 시.

import type { Scene } from "@/types/web-adventure";

export const endingShopkeeper: Scene = {
  id: "ending_shopkeeper",
  illustration: "/web-adventure/scenes/market.jpg",
  title: "시장의 새 주인 — 정착 엔딩",
  body: [
    "행상인은 보따리를 풀어 너에게 한 자리를 비워 준다.",
    "*\"내일부터 자네가 여기 주인이네. 손님이 오면 따뜻하게 맞아 주게.\"*",
    "광장의 새벽이 새로 밝아 온다. 너는 이제 좌판을 펴는 사람이 되었다 — 다른 누군가의 모험을 응원하는 자리에서.",
  ],
  choices: [],
  isEnding: true,
  endingId: "shopkeeper",
};
