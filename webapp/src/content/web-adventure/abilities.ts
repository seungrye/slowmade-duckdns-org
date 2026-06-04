// 어빌리티 1 종 선택. PoC 4 종.
// 보정 규칙은 lib/web-adventure/engine/rollDice.ts 와 1:1 매핑.

import type { AbilityKey } from "@/types/web-adventure";

export const abilities: Record<AbilityKey, { name: string; desc: string }> = {
  scholar: { name: "학자의 눈", desc: "지능 판정 +2" },
  warrior: { name: "전사의 손", desc: "힘 판정 +2" },
  silver_tongue: { name: "말솜씨", desc: "카리스마 판정 +2" },
  lucky: { name: "행운아", desc: "게임당 재굴림 3 회" },
};

export const ABILITY_KEYS: AbilityKey[] = ["scholar", "warrior", "silver_tongue", "lucky"];
