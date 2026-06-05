// 〈에테르니아의 추락〉 성흔 4 종 (#253 리프래시).
//
// 보정 규칙은 lib/web-adventure/engine/rollDice.ts 와 1:1 매핑.
// 무흔(none) — 성흔 없음. 마법 못 쓰지만 석화병 면역 + 재굴림 +3.

import type { AbilityKey } from "@/types/web-adventure";

export const abilities: Record<AbilityKey, { name: string; desc: string }> = {
  lunar: { name: "루나 성흔", desc: "학식/지능 판정 +2" },
  selene: { name: "셀레네 성흔", desc: "완력/전투 판정 +2" },
  hecate: { name: "헤카테 성흔", desc: "언변/카리스마 판정 +2" },
  none: { name: "무흔", desc: "석화병 면역. 재굴림 +3 (마법 못 씀)" },
};

export const ABILITY_KEYS: AbilityKey[] = ["lunar", "selene", "hecate", "none"];
