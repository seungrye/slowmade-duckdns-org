// 〈에테르니아〉 #256 world flag 부메랑.
//
// 이전 회차의 endingId 가 다음 회차 character.flags 에 *world.*  flag* 로 자동 주입.
// 씬의 conditional 분기가 그 flag 를 검사해 다른 결말 / NPC / 대사로 이어진다.
//
// 주입 규칙 (idempotent):
//   ascension     → world.solaris_strong  (사제단 권력 강화)
//   revolution    → world.revolution_won  (아이언가드 무장)
//   harmony       → world.harmony_kept    (마법 본질 회복)
//   fall          → world.world_fell      (모든 도시 잿더미)
//   petrification → world.last_one_fell   (이전 카운트 강화)
//   sylvan_bond   → world.sylvan_awoke    (영수 깨어남)

import type { EndingId } from "@/types/web-adventure";

export const ENDING_TO_WORLD_FLAG: Record<EndingId, string> = {
  ascension: "world.solaris_strong",
  revolution: "world.revolution_won",
  harmony: "world.harmony_kept",
  fall: "world.world_fell",
  petrification: "world.last_one_fell",
  sylvan_bond: "world.sylvan_awoke",
};

export interface PastRunForFlags {
  endingId?: EndingId | string;
}

/**
 * 이전 회차 목록 → world.* flags 객체.
 * 같은 endingId 가 여러 번 등장해도 한 번만 true (idempotent).
 */
export function buildWorldFlags(pastRuns: PastRunForFlags[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const r of pastRuns) {
    if (!r?.endingId) continue;
    const key = ENDING_TO_WORLD_FLAG[r.endingId as EndingId];
    if (key) flags[key] = true;
  }
  return flags;
}
