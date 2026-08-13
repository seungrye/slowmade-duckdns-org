// 매매 차트의 표시 구간 (#95 · 날짜 기준 정정 #129 · 자르지 않고 창만 잡기 #133).
//
// /admin/portfolio 는 기간 선택이 없어 쌓인 스냅샷 전체를 그린다. 날이 갈수록 포인트가
// 늘어 좁은 화면에서는 선이 뭉개지고 매매 마커도 겹친다.
//
// **데이터는 자르지 않는다.** 전부 넘기고 `dataZoom` 의 처음 보이는 창만 최근 N 일로 잡는다 —
// 그래야 밀거나 당겨서 이전 기간을 볼 수 있다. 잘라 버리면 나머지를 볼 방법이 없다.

/** 모바일에서 처음 보여줄 일수. */
export const MOBILE_CHART_DAYS = 30;
/** 데스크톱에서 처음 보여줄 일수 — 최근 3 개월. */
export const DESKTOP_CHART_DAYS = 90;

export function windowDays(isMobile: boolean, days?: number): number {
  return days ?? (isMobile ? MOBILE_CHART_DAYS : DESKTOP_CHART_DAYS);
}

/**
 * 처음 보여줄 창의 **시작 날짜**. `dataZoom` 의 `startValue` 로 그대로 쓴다.
 *
 * **개수가 아니라 날짜로 잡는다.** 처음엔 "스냅샷은 하루 한 점이니 개수가 곧 일수" 로 보고
 * 마지막 N 개를 남겼는데, 스냅샷은 **거래일에만** 쌓인다. 운영 데이터가 33 점에 달력 45 일이라
 * 모바일에서도 6 주가 보였다(#129).
 *
 * 기준은 오늘이 아니라 **데이터의 마지막 날**이다. 오늘로 재면 며칠 쉬는 사이 창이 비어 버린다.
 *
 * @returns 창을 잡을 필요가 없으면(데이터가 이미 그 안이거나 날짜를 못 읽으면) undefined —
 *   호출측은 `startValue` 를 주지 않아 전체가 보이게 둔다.
 */
export function windowStartDate(
  dates: string[],
  isMobile: boolean,
  days?: number,
): string | undefined {
  if (dates.length === 0) return undefined;

  const newest = Date.parse(dates[dates.length - 1]);
  const oldest = Date.parse(dates[0]);
  // 날짜를 못 읽으면 손대지 않는다 — 잘못 잡아 감추느니 다 보여 주는 편이 낫다.
  if (Number.isNaN(newest) || Number.isNaN(oldest)) return undefined;

  // 마지막 날을 포함해 `window` 일 — 30 일이면 마지막 날부터 29 일 전까지.
  const cutoff = newest - (windowDays(isMobile, days) - 1) * 86_400_000;
  if (oldest >= cutoff) return undefined; // 이미 창 안이다

  return new Date(cutoff).toISOString().slice(0, 10);
}
