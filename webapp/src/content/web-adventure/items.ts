// 〈에테르니아의 추락〉 아이템 카탈로그 (#252 리프래시).
//
// 5 종류:
//   - weapon: 공격력 (전투 시뮬레이션 시)
//   - consumable: heal — HP 회복 또는 stigma 감소 (USE_ITEM 즉시 사용)
//   - key: unlocks — 특정 씬 분기 (conditional hasItem)
//   - passive: passiveStat — 보유 시 effectiveStat 자동 반영
//   - quest: 이벤트 트리거 / 조건용
//
// 인벤토리 cap (INVENTORY_CAP = 8).

import type { StatKey } from "@/types/web-adventure";

export type ItemKind = "weapon" | "consumable" | "key" | "passive" | "quest";

export type Item = {
  id: string;
  displayName: string;
  desc: string;
  kind: ItemKind;
  stackable: boolean;
  attack?: number;
  heal?: number;
  /** #253 — 사용 시 침식도 감소 (양수 값). 음수면 침식 증가. */
  stigmaDelta?: number;
  passiveStat?: { stat: StatKey; bonus: number };
  unlocks?: string;
};

export const INVENTORY_CAP = 8;

export const items: Record<string, Item> = {
  // ── 주인공 시작 인벤 ────────────────────────────────────────────────
  patient_gown: {
    id: "patient_gown",
    displayName: "환자복",
    desc: "솔라리스 의무실의 표준 환자복. 카멜레온 같은 회색.",
    kind: "quest",
    stackable: false,
  },
  medical_bandage: {
    id: "medical_bandage",
    displayName: "의료용 붕대",
    desc: "급한 출혈은 막을 수 있다.",
    kind: "consumable",
    stackable: true,
    heal: 5,
  },
  investigator_badge: {
    id: "investigator_badge",
    displayName: "수사관 배지",
    desc: "아이언가드 공국의 신분증. 잘 쓰면 문이 열린다.",
    kind: "quest",
    stackable: false,
  },
  service_revolver: {
    id: "service_revolver",
    displayName: "지급 권총",
    desc: "6 발. 가솔린 탄. 정확하지만 시끄럽다.",
    kind: "weapon",
    stackable: false,
    attack: 4,
  },
  sylvan_bow: {
    id: "sylvan_bow",
    displayName: "정령 활",
    desc: "세계수 가지로 만든 활. 영수의 분노가 깃들어 있다.",
    kind: "weapon",
    stackable: false,
    attack: 3,
  },
  spirit_herb: {
    id: "spirit_herb",
    displayName: "영초",
    desc: "세계수의 작은 잎. 씹으면 정신이 맑아진다.",
    kind: "consumable",
    stackable: true,
    heal: 8,
  },

  // ── 성흔 관련 핵심 아이템 ─────────────────────────────────────────
  ether_refined_water: {
    id: "ether_refined_water",
    displayName: "에테르 정제수",
    desc: "푸른빛이 도는 액체. 한 모금이면 침식이 잠시 멎는다. 귀하다.",
    kind: "consumable",
    stackable: true,
    stigmaDelta: -3,
  },
  mana_stone_fragment: {
    id: "mana_stone_fragment",
    displayName: "마력석 파편",
    desc: "삼키면 마력이 잠시 활성된다. 그러나 몸은 더 굳어간다.",
    kind: "consumable",
    stackable: true,
    stigmaDelta: 5,
  },
  // #359 각성 — 침식 억제 장치. 보유 자체가 각성 조건(다중 게이트의 하나).
  stigma_suppressor: {
    id: "stigma_suppressor",
    displayName: "성흔 억제기",
    desc: "연구자가 건넨 룬 장치. 폭주하는 마력을 붙들어, 선택받지 못한 몸으로도 각성의 순간을 버티게 한다.",
    kind: "quest",
    stackable: false,
  },

  // ── 분기/퀘스트 아이템 ──────────────────────────────────────────
  imperial_seal: {
    id: "imperial_seal",
    displayName: "사제단 인장",
    desc: "은빛으로 빛나는 인장. 솔라리스 사제단 고위급의 표식.",
    kind: "quest",
    stackable: false,
  },
  ether_gas_canister: {
    id: "ether_gas_canister",
    displayName: "에테르 가솔린 통",
    desc: "노란 라벨이 붙은 작은 통. 무겁고 흔들리면 안 된다.",
    kind: "quest",
    stackable: true,
  },
  spirit_beast_feather: {
    id: "spirit_beast_feather",
    displayName: "영수의 깃털",
    desc: "은은하게 빛나는 깃털. 정령의 일부가 깃들어 있다.",
    kind: "passive",
    stackable: false,
    passiveStat: { stat: "wis", bonus: 1 },
  },
};

export const ITEM_IDS = Object.keys(items);
