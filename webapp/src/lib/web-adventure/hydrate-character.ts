// #289 옛 character snapshot 호환 — protagonist/stigmaErosion 보정.
//
// #287 schema 가 protagonist + stigmaErosion required. #258 이전 데이터 (옛 사극
// 콘텐츠 포함) 가 두 필드 없을 수 있음 → validation fail 차단.

export function hydrateCharacterSnapshot(raw: unknown): Record<string, unknown> {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    stats: c.stats ?? { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: typeof c.hp === "number" ? c.hp : 10,
    maxHp: typeof c.maxHp === "number" ? c.maxHp : 10,
    ability: typeof c.ability === "string" ? c.ability : "none",
    protagonist: typeof c.protagonist === "string" ? c.protagonist : "kael",
    stigmaErosion: typeof c.stigmaErosion === "number" ? c.stigmaErosion : 0,
    inventory: Array.isArray(c.inventory) ? c.inventory : [],
    flags: c.flags ?? {},
    rerollsLeft: typeof c.rerollsLeft === "number" ? c.rerollsLeft : 0,
  };
}
