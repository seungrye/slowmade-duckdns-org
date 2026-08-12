// 매매 차트의 표시 구간 (#95, 날짜 기준으로 정정 #129).
//
// /admin/portfolio 는 기간 선택이 없어 쌓인 스냅샷 전체를 그린다. 날이 갈수록 포인트가
// 늘어 좁은 화면에서는 선이 뭉개지고 매매 마커도 겹친다. 화면에 맞게 최근 구간만 남긴다.
//
// 차트가 history 를 여러 번 훑지만(라인 3 개·매매 마커·툴팁) 모두 같은 배열을 보므로,
// 이 배열 하나만 자르면 마커와 툴팁의 범위도 함께 맞는다.

/** 모바일에서 보여줄 일수. */
export const MOBILE_CHART_DAYS = 30;
/** 데스크톱에서 보여줄 일수 — 최근 3 개월. */
export const DESKTOP_CHART_DAYS = 90;

/**
 * 화면에 맞는 최근 구간만 남긴다 — 모바일 30 일, 데스크톱 90 일.
 *
 * **개수가 아니라 날짜로 자른다.** 처음엔 "스냅샷은 하루 한 점이니 개수가 곧 일수" 로 보고
 * 마지막 N 개를 남겼는데, 스냅샷은 **거래일에만** 쌓인다. 운영 데이터가 33 점에 달력 45 일이라
 * 모바일에서도 6 주가 보였다(#129).
 *
 * 기준은 오늘이 아니라 **데이터의 마지막 날**이다. 오늘로 재면 며칠 쉬는 사이 차트가 비어 버린다.
 *
 * 자를 것이 없으면 **받은 배열을 그대로 돌려준다.** 참조가 유지되어야 useMemo 가 헛돌지 않는다.
 *
 * @param days 직접 지정(테스트·특수 화면). 미지정이면 화면에 따라 정한다.
 */
export function recentPoints<T extends { dateStr: string }>(
  points: T[],
  isMobile: boolean,
  days?: number,
): T[] {
  const window = days ?? (isMobile ? MOBILE_CHART_DAYS : DESKTOP_CHART_DAYS);
  if (points.length === 0) return points;

  const newest = Date.parse(points[points.length - 1].dateStr);
  // 날짜를 못 읽으면 자르지 않는다 — 잘못 잘라 없애느니 다 보여 주는 편이 낫다.
  if (Number.isNaN(newest)) return points;

  // 마지막 날을 포함해 `window` 일 — 30 일이면 마지막 날부터 29 일 전까지.
  const cutoff = newest - (window - 1) * 86_400_000;
  const from = points.findIndex((p) => {
    const t = Date.parse(p.dateStr);
    return Number.isNaN(t) ? false : t >= cutoff;
  });

  if (from <= 0) return points; // 자를 것이 없거나(0) 남는 게 없다(-1)
  return points.slice(from);
}
