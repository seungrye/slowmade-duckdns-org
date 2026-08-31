// 포트폴리오 설정 리비전 — 순수 함수 (#350).
//
// #348 에서 미국 블록의 config 가 전략 전환 때 통째로 덮여 사라졌다. 백업도 oplog 도 없어
// 15 거래일치 주문로그·체결을 floor() 제약으로 역산해야 했고, 그러고도 principal 은 $142
// 구간까지만 좁혀졌다. 값을 바꿀 때마다 그 시점 값을 남겨 두면 그럴 일이 없다.
//
// 여기는 DB 를 모른다 — 무엇이 설정이고 무엇이 바뀌었는지만 판단한다.

/** 리비전에 담는 것 = 사람이 정하는 값. 엔진이 정하는 값은 여기 없다. */
export const SETTING_KEYS = [
  "market", "strategy", "runAt", "weekdaysOnly", "enabled", "reservedCash", "config",
] as const;

export interface PortfolioSettings {
  market: string;
  strategy: string;
  runAt: string;
  weekdaysOnly: boolean;
  enabled: boolean;
  reservedCash: number;
  config: Record<string, unknown>;
}

/**
 * 문서에서 설정 필드만 뽑는다.
 *
 * **state 를 담지 않는 것이 핵심이다.** 엔진이 매 실행마다 T·cycleCash·lastRunDate 를 고치므로,
 * 담으면 설정을 하루도 안 건드린 날까지 리비전이 쌓여 이력이 쓸모없어진다. 화이트리스트라
 * 문서에 무엇이 더 붙든 새어 들어오지 않는다.
 */
export function snapshotOf(doc: Record<string, unknown>): PortfolioSettings {
  return {
    market: String(doc.market ?? ""),
    strategy: String(doc.strategy ?? ""),
    runAt: String(doc.runAt ?? ""),
    weekdaysOnly: doc.weekdaysOnly !== false,
    enabled: doc.enabled !== false,
    reservedCash: Number(doc.reservedCash ?? 0) || 0,
    config: (doc.config ?? {}) as Record<string, unknown>,
  };
}

/** 순서를 타지 않는 깊은 비교 — config 는 자유 JSON 이라 키 순서만 다른 경우가 흔하다. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b)
      && a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    const kx = Object.keys(x), ky = Object.keys(y);
    return kx.length === ky.length && kx.every((k) => k in y && same(x[k], y[k]));
  }
  return false;
}

/**
 * 바뀐 설정 키 목록. 안 바뀌었으면 빈 배열.
 *
 * **빈 배열이면 리비전을 만들지 않는다.** 저장 버튼만 눌러도 upsert 가 도는 구조라
 * (portfolios/route.ts), 이 규칙이 없으면 같은 값이 도배돼 이력이 쓸모없어진다.
 */
export function changedKeys(before: PortfolioSettings, after: PortfolioSettings): string[] {
  return SETTING_KEYS.filter((k) => !same(before[k], after[k]));
}
