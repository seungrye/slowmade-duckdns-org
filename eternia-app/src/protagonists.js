// The 3 protagonists' metadata - MIRROR webapp/src/content/web-adventure/protagonists.ts.
// (nameShort/role are extra fields for the app's nameplate.)

export const protagonists = {
  kael: {
    name: "카엘 (Kael)", nameShort: "카엘", role: "탈영병",
    oneLine: "솔라리스 제국 탈영병 · 시한부",
    baseStats: { str: 5, dex: 6, int: 7, cha: 4, con: 4, wis: 5 },
    startStigma: 80, startScene: "kael_infirmary",
    startInventory: ["patient_gown", "medical_bandage"],
  },
  rin: {
    name: "린 (Rin)", nameShort: "린", role: "수사관",
    oneLine: "아이언가드 공국 하급 수사관",
    baseStats: { str: 4, dex: 6, int: 7, cha: 6, con: 5, wis: 6 },
    startStigma: 10, startScene: "rin_harbor",
    startInventory: ["investigator_badge", "service_revolver"],
  },
  solwen: {
    name: "솔벤 (Solwen)", nameShort: "솔벤", role: "옥수",
    oneLine: "네오-엘프 자치령 옥수",
    baseStats: { str: 6, dex: 7, int: 5, cha: 5, con: 5, wis: 7 },
    startStigma: 0, startScene: "solwen_grove",
    startInventory: ["sylvan_bow", "spirit_herb"],
  },
};

export const PROTAGONIST_ORDER = ["kael", "rin", "solwen"];

// The HP and reroll formulas (webapp's CharacterCreator).
export const MAX_HP_BASE = 100;
export const MAX_HP_PER_CON = 5;
export const NO_STIGMA_REROLLS = 3;

/** A selection -> a finished Character (ported from webapp's submit()). */
export function buildCharacter(protagonist, ability) {
  const meta = protagonists[protagonist];
  const stats = Object.assign({}, meta.baseStats);
  const maxHp = MAX_HP_BASE + stats.con * MAX_HP_PER_CON;
  return {
    stats,
    hp: maxHp, maxHp,
    ability, protagonist,
    stigmaErosion: meta.startStigma,
    inventory: meta.startInventory.slice(),
    flags: {}, variables: {},
    rerollsLeft: ability === "none" ? NO_STIGMA_REROLLS : 0,
  };
}
