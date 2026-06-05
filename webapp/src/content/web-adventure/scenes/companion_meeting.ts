// 동료 만남 — 4 주차 신규.
// 광장 가장자리에서 너의 길에 합류하려는 누군가가 너를 본다.
// cha 12 ✓ → 동행 증표 획득.
// 일러스트: 광장 새벽 재사용.

import type { Scene } from "@/types/web-adventure";

export const companionMeeting: Scene = {
  id: "companion_meeting",
  illustration: "/web-adventure/scenes/town-square-dawn.jpg",
  title: "광장의 가장자리 — 동행할 자",
  body: [
    "광장의 동쪽 끝, 헐렁한 망토를 두른 누군가가 너의 발걸음을 따라온다.",
    "그는 멈춰 서서 말한다 — *\"나도 이 마을의 길을 헤매고 있네. 같이 가 줄 사람이 있으면 좋겠어.\"*",
    "너의 말 한 마디가 그의 신뢰를 얻을 수 있을지도 모른다.",
  ],
  choices: [
    {
      kind: "probability",
      id: "befriend_companion",
      label: "동행을 받아들인다",
      stat: "cha",
      difficulty: 12,
      onSuccess: "companion_success",
      onFailure: "town_square_dawn",
    },
    {
      kind: "plain",
      id: "decline_companion",
      label: "정중히 거절한다",
      to: "town_square_dawn",
    },
  ],
  // 5 주차 (#221) — 광장 재진입 시 일회성 진입 선택지 자동 hidden.
  onEnter: { setFlags: { companionMet: true } },
};
