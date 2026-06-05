// 산기슭 입구 — 마법사 분기 진입점 (4 주차 신규).
// 광장 → 산기슭. wis 11 ✓ 시 마법사를 만난다, 실패 시 광장 복귀.
// 일러스트: 동굴 재사용.

import type { Scene } from "@/types/web-adventure";

export const mountainFoot: Scene = {
  id: "mountain_foot",
  illustration: "/web-adventure/scenes/cave.jpg",
  title: "산기슭 — 바위 길의 시작",
  body: [
    "마을 광장의 동쪽 끝, 안개가 걷힌 자리에 *산기슭 길* 이 드러난다.",
    "절벽 사이로 가느다란 오솔길이 이어진다. 길 끝 어딘가에 — 마을 노인들이 가끔 떠올리던 — *늙은 마법사의 오두막* 이 있다는 풍문이 있다.",
    "정신을 집중한다면 그 풍문의 자취를 따라갈 수 있을지도 모른다.",
  ],
  choices: [
    {
      kind: "probability",
      id: "find_wizard",
      label: "마법사의 자취를 따라간다",
      stat: "wis",
      difficulty: 11,
      onSuccess: "wizard_meeting",
      onFailure: "town_square_dawn",
    },
    {
      kind: "plain",
      id: "back_to_square_from_foot",
      label: "광장으로 돌아간다",
      to: "town_square_dawn",
    },
  ],
};
