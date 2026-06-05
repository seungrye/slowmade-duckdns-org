// 〈에테르니아의 추락〉 3 주인공 메타 (#251).

import type { Protagonist, StatKey } from "@/types/web-adventure";

export type ProtagonistMeta = {
  name: string;
  oneLine: string;
  description: string;
  /** 시작 스탯 (보너스 분배 *전* base). 일반 5 가 아닌 *주인공 별 기본 보정*. */
  baseStats: Record<StatKey, number>;
  startStigma: number;
  startScene: string;
  startInventory: string[];
};

export const protagonists: Record<Protagonist, ProtagonistMeta> = {
  kael: {
    name: "카엘 (Kael)",
    oneLine: "솔라리스 제국 탈영병 · 시한부",
    description:
      "마법 과다 사용으로 시한부 판정을 받은 마법공학 기사. 의무실에서 폐기 처분을 통보받고 탈출을 결심한다. 시작 시 침식도 80 — 한 발 한 발이 카운트다운.",
    baseStats: { str: 5, dex: 6, int: 7, cha: 4, con: 4, wis: 5 },
    startStigma: 80,
    startScene: "kael_infirmary",
    startInventory: ["patient_gown", "medical_bandage"],
  },
  rin: {
    name: "린 (Rin)",
    oneLine: "아이언가드 공국 하급 수사관",
    description:
      "검은 연기의 항만에서 에테르 가솔린 밀수 현장을 조사하던 중 제국 고위층-사제단의 추악한 비밀에 접근하게 된 신참 수사관. 침식도 10 — 마법보다 추리.",
    baseStats: { str: 4, dex: 6, int: 7, cha: 6, con: 5, wis: 6 },
    startStigma: 10,
    startScene: "rin_harbor",
    startInventory: ["investigator_badge", "service_revolver"],
  },
  solwen: {
    name: "솔벤 (Solwen)",
    oneLine: "네오-엘프 자치령 옥수(獄守)",
    description:
      "세계수 외곽에서 인간의 영수 사냥을 막아온 정령 마법사. 사냥꾼들에게 신성한 영수가 살해당하는 것을 목격하고 복수를 맹세한다. 침식도 0 — 그러나 분노가 다른 카운터.",
    baseStats: { str: 6, dex: 7, int: 5, cha: 5, con: 5, wis: 7 },
    startStigma: 0,
    startScene: "solwen_grove",
    startInventory: ["sylvan_bow", "spirit_herb"],
  },
};

export const PROTAGONIST_ORDER: Protagonist[] = ["kael", "rin", "solwen"];
