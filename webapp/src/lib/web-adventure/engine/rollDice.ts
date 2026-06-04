// d20 + 스탯 + 어빌리티 보정 — 확률 판정 핵심.
//
// 공식:
//   total = stat + d20(roll) + abilityBonus(stat 종류와 어빌이 일치하면 +2)
//   success = total >= difficulty
//
// rng 인자는 [0, 1) 의 Math.random() 호환. 테스트는 결정적 rng 주입.

import type { AbilityKey, StatKey } from "@/types/web-adventure";

export type RollResult = {
  success: boolean;
  /** 1..20 */
  roll: number;
  bonus: number;
  total: number;
};

export type RollOptions = {
  stat: number;
  ability: AbilityKey;
  statKey: StatKey;
  difficulty: number;
  rng?: () => number;
};

/** 어빌별 보정 — 일치하는 statKey 면 +2. 그 외 0. */
function abilityBonus(ability: AbilityKey, statKey: StatKey): number {
  if (ability === "scholar" && statKey === "int") return 2;
  if (ability === "warrior" && statKey === "str") return 2;
  if (ability === "silver_tongue" && statKey === "cha") return 2;
  // lucky 는 재굴림으로 별도 처리 — 보정 없음.
  return 0;
}

/** [0, 1) → 1..20 인 d20. */
function rollD20(rng: () => number): number {
  const v = rng();
  // 안전 클램프 — rng 가 1.0 을 돌려줄 가능성 차단 (Math.random 은 1 제외, 외부 주입 보호).
  const clamped = v >= 1 ? 0.99999 : Math.max(0, v);
  return Math.floor(clamped * 20) + 1;
}

export function rollProbability(opts: RollOptions): RollResult {
  const rng = opts.rng ?? Math.random;
  const roll = rollD20(rng);
  const bonus = abilityBonus(opts.ability, opts.statKey);
  const total = opts.stat + roll + bonus;
  return {
    roll,
    bonus,
    total,
    success: total >= opts.difficulty,
  };
}

/** 라이브 확률 표시용 — 성공 확률(%) 을 정수로. */
export function estimateSuccessPercent(opts: Omit<RollOptions, "rng">): number {
  const bonus = abilityBonus(opts.ability, opts.statKey);
  // d20 (1..20) 중 success 가 되는 굴림 수 / 20.
  let success = 0;
  for (let r = 1; r <= 20; r++) {
    if (opts.stat + r + bonus >= opts.difficulty) success += 1;
  }
  return Math.round((success / 20) * 100);
}
