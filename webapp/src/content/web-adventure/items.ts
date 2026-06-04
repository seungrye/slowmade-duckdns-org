// 아이템 카탈로그 — 3 주차 인벤토리 시스템.
//
// 5 종류:
//   - weapon: 공격력 (5 주차 전투에서 사용)
//   - consumable: heal — HP 회복 (USE_ITEM 즉시 사용)
//   - key: unlocks — 특정 씬 분기 (현재는 conditional hasItem 로 표현)
//   - passive: passiveStat — 보유 시 effectiveStat 에 자동 반영
//   - quest: 이벤트 트리거 / 분기 조건용 (예: super_tintham_cracker)
//
// 인벤토리 cap (INVENTORY_CAP = 8) — reducer 가 addItems 시 cap 초과분 무시.
//
// #203 — stackable 필드:
//   - true: 같은 id 를 여러 개 보유 가능 (consumable 만 해당).
//   - false: 같은 id 가 이미 인벤에 있으면 onEnter.addItems 가 skip (재진입 중복 방지).

import type { StatKey } from "@/types/web-adventure";

export type ItemKind = "weapon" | "consumable" | "key" | "passive" | "quest";

export type Item = {
  id: string;
  displayName: string;
  desc: string;
  kind: ItemKind;
  /** true 면 같은 id 를 여러 개 보유 가능. false 면 onEnter.addItems 가 중복 skip. */
  stackable: boolean;
  attack?: number;
  heal?: number;
  passiveStat?: { stat: StatKey; bonus: number };
  unlocks?: string;
};

export const INVENTORY_CAP = 8;

export const items: Record<string, Item> = {
  bread: {
    id: "bread",
    displayName: "빵",
    desc: "갓 구운 빵. 소량 회복.",
    kind: "consumable",
    stackable: true,
    heal: 20,
  },
  herb: {
    id: "herb",
    displayName: "약초",
    desc: "산에서 자란 약초. 상처를 다스린다.",
    kind: "consumable",
    stackable: true,
    heal: 40,
  },
  rusty_sword: {
    id: "rusty_sword",
    displayName: "녹슨 검",
    desc: "오래된 검. 그래도 베인다.",
    kind: "weapon",
    stackable: false,
    attack: 3,
  },
  torch: {
    id: "torch",
    displayName: "횃불",
    desc: "어둠 속에서도 길을 비춘다.",
    kind: "key",
    stackable: false,
    unlocks: "cave_inside",
  },
  rusty_key: {
    id: "rusty_key",
    displayName: "녹슨 열쇠",
    desc: "어느 문의 열쇠인지 모른다.",
    kind: "key",
    stackable: false,
  },
  spirit_glasses: {
    id: "spirit_glasses",
    displayName: "산신령의 안경",
    desc: "보이지 않는 것을 보게 한다. 지혜 +1.",
    kind: "passive",
    stackable: false,
    passiveStat: { stat: "wis", bonus: 1 },
  },
  goblin_charm: {
    id: "goblin_charm",
    displayName: "도깨비 부적",
    desc: "도깨비의 우정. 카리스마 +1.",
    kind: "passive",
    stackable: false,
    passiveStat: { stat: "cha", bonus: 1 },
  },
  spellbook: {
    id: "spellbook",
    displayName: "마법서",
    desc: "낡았지만 살아 있는 글자들. 지능 +1.",
    kind: "passive",
    stackable: false,
    passiveStat: { stat: "int", bonus: 1 },
  },
  market_receipt: {
    id: "market_receipt",
    displayName: "시장 영수증",
    desc: "정당하게 산 증거.",
    kind: "quest",
    stackable: false,
  },
  super_tintham_cracker: {
    id: "super_tintham_cracker",
    displayName: "졸라맛있는 틴탐 크래커",
    desc: "장로가 사랑하는 그 비밀 간식.",
    kind: "quest",
    stackable: false,
  },
  scroll: {
    id: "scroll",
    displayName: "낡은 두루마리",
    desc: "글자가 절반쯤 지워진 두루마리.",
    kind: "quest",
    stackable: false,
  },
  companion_token: {
    id: "companion_token",
    displayName: "동행 증표",
    desc: "누군가가 너와 함께한다는 증거.",
    kind: "quest",
    stackable: false,
  },
};

export const ITEM_IDS = Object.keys(items);
