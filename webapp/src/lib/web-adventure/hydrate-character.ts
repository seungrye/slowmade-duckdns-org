// #289 옛 character snapshot 호환 — protagonist/stigmaErosion 보정.
//
// #287 schema 가 protagonist + stigmaErosion required. #258 이전 데이터 (옛 사극
// 콘텐츠 포함) 가 두 필드 없을 수 있음 → validation fail 차단.

import { flagsForStore } from "./flags";

// #290 — NaN/Infinity 차단 helper. typeof number === 'number' 는 NaN 도 true.
function isFiniteNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

export function hydrateCharacterSnapshot(raw: unknown): Record<string, unknown> {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    stats: c.stats ?? { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: isFiniteNumber(c.hp) ? (c.hp as number) : 10,
    maxHp: isFiniteNumber(c.maxHp) ? (c.maxHp as number) : 10,
    ability: typeof c.ability === "string" ? c.ability : "none",
    protagonist: typeof c.protagonist === "string" ? c.protagonist : "kael",
    // #290 — NaN/Infinity 차단 (mongoose schema 의 0-100 검증 통과 안 됨).
    stigmaErosion: isFiniteNumber(c.stigmaErosion) ? (c.stigmaErosion as number) : 0,
    inventory: Array.isArray(c.inventory) ? c.inventory : [],
    // #356 — world.* 키의 점 때문에 저장이 통째로 실패했다. 값만 정리하고 키는 둔다.
    flags: flagsForStore(c.flags),
    rerollsLeft: isFiniteNumber(c.rerollsLeft) ? (c.rerollsLeft as number) : 0,
  };
}
