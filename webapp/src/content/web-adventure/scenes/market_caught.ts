// 시장 비밀 창고 잠입 — 실패 분기.
// 3 주차: caughtBefore 플래그 부여.
// 4 주차: caughtCount 누적 + 3 회 이상 시 *뒷골목 → 추방* 분기.

import type { Scene } from "@/types/web-adventure";

export const marketCaught: Scene = {
  id: "market_caught",
  illustration: "/web-adventure/scenes/market.jpg",
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
    {
      // 4 주차 — 3 회 이상 들킨 경우에만 노출 (hidden=true).
      kind: "conditional",
      id: "to_back_alley",
      label: "뒷골목으로 숨어 든다",
      condition: { kind: "minFlag", key: "caughtCount", min: 3 },
      to: "market_back_alley",
      hidden: true,
    },
  ],
  onEnter: {
    setFlags: { caughtBefore: true },
    incrementCounters: ["caughtCount"],
  },
};
