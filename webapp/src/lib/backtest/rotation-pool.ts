// 로테이션 후보 자동 선발 — 검증된 시드 풀에서 유동성(거래대금) 상위 선발.
// 파이썬 stock-automator-v2 strategy/rotation_pool.py 와 동일 규칙(교차 대조).
//
// - 시드는 사람이 검증한 고정 리스트(레버리지 불 계열, 인버스 제외 — 현금 대피 확정).
//   시장 전체 자동 발굴은 이름 파싱이 깨지기 쉽고 미검증 신상품이 새어들어 채택하지 않음.
// - 기초지수 그룹당 1종만 — 같은 지수 레버리지 중복은 로테이션의 분산 의미를 없앤다.
// - 거래대금 데이터가 없는 시드는 선발에서 빠지되, 자리가 남으면 시드 순서로 충원(결정적).

export interface SeedEntry {
  ticker: string;
  group: string; // 기초지수 그룹 — 같은 그룹은 풀에 1종만
}

export const DEFAULT_POOL_SIZE = 4;
export const DEFAULT_LIQ_DAYS = 20; // 거래대금 평균 기간(거래일)

// 미장 — 레버리지 불 3배 (py US_SEED 와 동일 순서).
export const US_SEED: SeedEntry[] = [
  { ticker: "TQQQ", group: "nasdaq100" },
  { ticker: "SOXL", group: "semis" },
  { ticker: "UPRO", group: "sp500" },
  { ticker: "TECL", group: "tech" },
  { ticker: "TNA", group: "russell2000" },
  { ticker: "FAS", group: "financials" },
  { ticker: "LABU", group: "biotech" },
];

// 국장 — 국내 상장 레버리지(2배가 최대). 지수·산업형만, 단일종목 레버리지 제외(py KR_SEED 동일).
export const KR_SEED: SeedEntry[] = [
  { ticker: "122630", group: "kospi200" }, // KODEX 레버리지
  { ticker: "233740", group: "kosdaq150" }, // KODEX 코스닥150레버리지
  { ticker: "409820", group: "nasdaq100" }, // KODEX 미국나스닥100레버리지(합성 H)
  { ticker: "423920", group: "sox" }, // TIGER 미국필라델피아반도체레버리지(합성)
  { ticker: "418660", group: "nasdaq100" }, // TIGER 미국나스닥100레버리지(합성) — 409820 과 그룹 경쟁
  { ticker: "494310", group: "kr_semis" }, // KODEX 반도체레버리지(2024-10 상장)
  { ticker: "243880", group: "kospi200it" }, // TIGER 200IT레버리지
  { ticker: "462330", group: "battery" }, // KODEX 2차전지산업레버리지
];

/** 거래대금(종가×거래량) 시계열(과거→최신)에서 최근 days 일 평균. 부족/0 이면 null. */
export function liquidityMetric(values: number[], days: number = DEFAULT_LIQ_DAYS): number | null {
  if (values.length < days) return null;
  let sum = 0;
  for (let i = values.length - days; i < values.length; i++) sum += values[i];
  const avg = sum / days;
  return avg > 0 ? avg : null;
}

/** 거래대금 상위 topN 선발 — 그룹당 1종, 무데이터 시드는 시드 순서로 충원(py select_pool 동일). */
export function selectPool(
  seed: SeedEntry[],
  metrics: Record<string, number | null>,
  topN: number = DEFAULT_POOL_SIZE,
): string[] {
  const picked: string[] = [];
  const groups = new Set<string>();
  const scored = seed
    .filter((s) => metrics[s.ticker] !== null && metrics[s.ticker] !== undefined)
    .sort((a, b) => metrics[b.ticker]! - metrics[a.ticker]!); // Array.sort 는 안정 정렬 — 동률은 시드 순서
  for (const s of scored) {
    if (picked.length >= topN) break;
    if (groups.has(s.group)) continue;
    picked.push(s.ticker);
    groups.add(s.group);
  }
  for (const s of seed) {
    if (picked.length >= topN) break;
    if (picked.includes(s.ticker) || groups.has(s.group)) continue;
    picked.push(s.ticker);
    groups.add(s.group);
  }
  return picked;
}
