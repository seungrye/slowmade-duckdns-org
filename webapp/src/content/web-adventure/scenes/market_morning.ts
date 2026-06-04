// 시장 — 아침. 확률 판정 진입 씬.
// 비밀 창고 잠입 (민첩 12) — 성공: 비밀 간식 / 실패: 들킴.

import type { Scene } from "@/types/web-adventure";

export const marketMorning: Scene = {
  id: "market_morning",
  illustration: "/web-adventure/scenes/town-square-dawn.png",
  title: "시장 — 아침",
  body: [
    "마을 시장은 새벽부터 분주하다. 좌판마다 상인들이 자리를 잡고 있다.",
    "구두쇠 박씨가 의심스러운 눈으로 너를 훑어본다. 그의 좌판 뒤로 비밀 창고의 입구가 살짝 보인다.",
    "(잠입에 성공하면 무언가 귀한 것을 얻을 수 있을 것 같다.)",
  ],
  choices: [
    {
      kind: "probability",
      id: "sneak_storage",
      label: "비밀 창고로 몰래 잠입한다",
      stat: "dex",
      difficulty: 12,
      onSuccess: "market_storage_success",
      onFailure: "market_caught",
    },
    {
      kind: "plain",
      id: "back_to_square",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
};
