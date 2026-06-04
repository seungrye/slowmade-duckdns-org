// 시장 비밀 창고 잠입 — 성공 분기.
// onEnter 로 hasSecretSnack 플래그를 부여 (인벤 시스템은 3 주차에서 도입).

import type { Scene } from "@/types/web-adventure";

export const marketStorageSuccess: Scene = {
  id: "market_storage_success",
  illustration: "/web-adventure/scenes/market.jpg",
  title: "비밀 창고 — 성공",
  body: [
    "한 호흡에 좌판 뒤를 빠져나갔다. 박씨의 시선은 다른 손님에게 향해 있다.",
    "창고 안에는 손바닥만 한 보따리가 하나 — 장로가 좋아한다는 그 *비밀 간식* 이다.",
    "조용히 챙겨 빠져나온다.",
  ],
  choices: [
    {
      kind: "plain",
      id: "to_elder",
      label: "장로의 집으로 향한다",
      to: "elder_house_arrival",
    },
  ],
  // 3 주차: hasSecretSnack flag → super_tintham_cracker 아이템.
  onEnter: { addItems: ["super_tintham_cracker"] },
};
