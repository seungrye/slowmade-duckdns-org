// 게임 규칙 — 굴림/침식/조건평가 (순수 함수).
//
// MIRROR — webapp/src/lib/web-adventure/engine/{rollDice,stigma}.ts + reducer.evalCondition 을
// 앱 JS 로 이식. character 는 {stats, inventory, flags, stigmaErosion, ability, hp, maxHp} 형태.
// ⚠ effectiveStat 은 base stat 만 반영(패시브 아이템 보너스 미이식 — 후속 슬라이스).

export const STIGMA_MAX = 100;
export const STIGMA_DEBUFF_THRESHOLD = 50;
export const STIGMA_CRITICAL_THRESHOLD = 80;
export const INVENTORY_CAP = 8;

// ── 굴림 (d20 + stat + 성흔 보정 vs 난이도) ──
/** 성흔 어빌별 보정 — 일치하는 statKey 면 +2. lunar→int, selene→str, hecate→cha, none→0. */
export function abilityBonus(ability, statKey) {
  if (ability === "lunar" && statKey === "int") return 2;
  if (ability === "selene" && statKey === "str") return 2;
  if (ability === "hecate" && statKey === "cha") return 2;
  return 0;
}

/** [0,1) → 1..20. rng 가 1.0 이어도 안전 클램프. */
export function rollD20(rng) {
  const v = rng();
  const clamped = v >= 1 ? 0.99999 : Math.max(0, v);
  return Math.floor(clamped * 20) + 1;
}

/** @returns {{success:boolean, roll:number, bonus:number, total:number}} */
export function rollProbability(opts) {
  const rng = opts.rng || Math.random;
  const roll = rollD20(rng);
  const bonus = abilityBonus(opts.ability, opts.statKey);
  const total = opts.stat + roll + bonus;
  return { roll, bonus, total, success: total >= opts.difficulty };
}

/** 성공 확률(%) 정수 — 라이브 표시용. */
export function estimateSuccessPercent(opts) {
  const bonus = abilityBonus(opts.ability, opts.statKey);
  let success = 0;
  for (let r = 1; r <= 20; r++) {
    if (opts.stat + r + bonus >= opts.difficulty) success += 1;
  }
  return Math.round((success / 20) * 100);
}

// ── 침식(stigma) ──
/** 침식 ≥ 50 이면 con/dex 판정에 -2. 그 외 0. */
export function stigmaDebuff(stigmaErosion, stat) {
  if ((stigmaErosion || 0) < STIGMA_DEBUFF_THRESHOLD) return 0;
  if (stat === "con" || stat === "dex") return -2;
  return 0;
}

/** 침식도 가감 clamp [0,100] — NaN/Infinity 방어. */
export function clampStigma(start, delta) {
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return Math.max(0, Math.min(STIGMA_MAX, safeStart + safeDelta));
}

export function isFullyPetrified(character) {
  return (character.stigmaErosion || 0) >= STIGMA_MAX;
}
export function isDead(character) {
  return (character.hp || 0) <= 0;
}

/** base stat (패시브 아이템 보너스 미반영 — 후속). */
export function effectiveStat(character, stat) {
  return character.stats[stat] || 0;
}

/** 판정용 유효 스탯 = base + 침식 디버프. */
export function rollStat(character, stat) {
  return effectiveStat(character, stat) + stigmaDebuff(character.stigmaErosion, stat);
}

// ── 조건 평가 (reducer.evalCondition 이식) ──
export function evalCondition(cond, character) {
  if (!cond) return true;
  switch (cond.kind) {
    case "minStat":
      return rollStat(character, cond.stat) >= cond.min;
    case "hasItem":
      return character.inventory.indexOf(cond.itemId) >= 0;
    case "flag": {
      const expected = cond.expect === undefined ? true : cond.expect;
      const actual = character.flags[cond.key] === true;
      return actual === expected;
    }
    case "minFlag": {
      const v = character.flags[cond.key];
      const num = typeof v === "number" ? v : v === true ? 1 : 0;
      return num >= cond.min;
    }
    case "ability":
      return character.ability === cond.required;
    case "stigmaAtLeast":
      return (character.stigmaErosion || 0) >= cond.min;
    case "all":
      return (cond.conditions || []).every((c) => evalCondition(c, character));
    default:
      return true; // 미지 조건은 열어둔다.
  }
}
