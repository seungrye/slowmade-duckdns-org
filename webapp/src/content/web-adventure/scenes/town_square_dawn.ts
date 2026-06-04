// 마을 광장의 새벽 — PoC 의 진입 씬.
// 1 주차 PoC 라서 3 선택지가 모두 *같은 엔딩* 으로 수렴 (모델 검증용).

import type { Scene } from "@/types/web-adventure";

export const townSquareDawn: Scene = {
  id: "town_square_dawn",
  illustration: "/web-adventure/scenes/town-square-dawn.png",
  title: "마을 광장의 새벽",
  body: [
    "회색빛 하늘 아래, 마을 광장에 첫 햇살이 닿는다.",
    "장로의 집에서 무거운 부탁이 있다고 들었다. 시간이 많지는 않다.",
  ],
  choices: [
    { kind: "plain", id: "to_elder", label: "장로의 집으로 간다", to: "elder_ending" },
    {
      kind: "probability",
      id: "scout_market",
      label: "시장을 먼저 살핀다",
      stat: "dex",
      difficulty: 12,
      onSuccess: "elder_ending",
      onFailure: "elder_ending",
    },
    {
      kind: "conditional",
      id: "secret_shrine",
      label: "산기슭 신단으로 향한다",
      condition: { kind: "minStat", stat: "wis", min: 8 },
      to: "elder_ending",
    },
  ],
};
