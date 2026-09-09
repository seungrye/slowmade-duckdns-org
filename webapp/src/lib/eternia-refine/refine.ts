// 정제 — 결정을 태워 에테르로 바꾼다 (#419).
//
// 이 게임에서 상점은 순수한 이득이 아니다. **강해지는 유일한 길이 마지막 상대를 키우는
// 길이기도 하다.** 결정을 팔면 덱이 뚫리고 최상급 카드를 살 돈이 생기지만, 판 결정은
// 그대로 사제단의 연료가 되어 부유도시를 키운다.
//
// 그래서 매 상점마다 플레이어가 받는 질문은 늘 하나다 — 지금 얼마나 태울까.

/** 결정 1장이 주는 에테르. */
export const ETHER_PER_CRYSTAL = 18;

/**
 * 카드 하나를 지우는 값 (#439). **결정 하나치와 같게 둔다.**
 *
 * 같은 값으로 맞추면 거래가 한눈에 읽힌다:
 *
 *   결정 하나를 태운다 → 에테르 18 + 도시 +1(보스 체력 +12)
 *   에테르 18을 쓴다   → 카드 하나를 지운다
 *
 * 즉 **덱을 다듬으려면 마지막 상대를 키워야 한다.** 값을 올려 가며 제한할 이유가 없다 —
 * 진짜 상한은 에테르가 아니라 도시가 자란다는 사실이다.
 */
export const ETHER_PER_REMOVAL = 18;

/** 결정 1장을 팔 때마다 도시가 이만큼 자란다. */
export const CITY_POWER_PER_CRYSTAL = 1;

/** 도시가 1 자랄 때마다 최종 보스가 얻는 체력. */
export const BOSS_HP_PER_CITY_POWER = 12;

export interface RefineInput {
  /** 지금 덱에 있는 결정 수. */
  crystalsLeft: number;
  /** 태울 장수. */
  count: number;
  /** 지금 가진 에테르. */
  ether: number;
  /** 지금까지 판 누계. */
  refined: number;
  /** 지금까지 키운 도시. */
  cityPower: number;
}

export interface RefineResult {
  crystalsLeft: number;
  ether: number;
  refined: number;
  cityPower: number;
  /** 실제로 태운 장수 — 가진 것보다 많이 부르면 가진 만큼만 탄다. */
  burned: number;
}

/**
 * 결정을 태운다.
 *
 * 가진 것보다 많이 부르면 **가진 만큼만** 태운다(막지 않고 자른다) — 화면이 슬라이더든
 * 버튼이든 상한을 따로 챙기지 않아도 되게.
 *
 * ```
 * refine({crystalsLeft:4, count:2, ether:44, refined:7, cityPower:3})
 *   -> {crystalsLeft:2, ether:80, refined:9, cityPower:5, burned:2}
 * ```
 */
export function refine(input: RefineInput): RefineResult {
  const burned = Math.max(0, Math.min(input.count, input.crystalsLeft));
  return {
    crystalsLeft: input.crystalsLeft - burned,
    ether: input.ether + burned * ETHER_PER_CRYSTAL,
    refined: input.refined + burned,
    cityPower: input.cityPower + burned * CITY_POWER_PER_CRYSTAL,
    burned,
  };
}

/**
 * 지금까지 키운 도시가 최종 보스에게 얹어 주는 체력.
 *
 * 정제소에서 이 숫자를 미리 보여 준다 — 대가를 나중에 알게 하면 선택이 아니라 함정이다.
 */
export function bossHpBonus(cityPower: number): number {
  return Math.max(0, cityPower) * BOSS_HP_PER_CITY_POWER;
}
