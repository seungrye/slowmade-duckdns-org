// 매매 차트의 표시 구간 (#95).
//
// /admin/portfolio 는 기간 선택이 없어 쌓인 스냅샷 전체를 그린다. 날이 갈수록 포인트가
// 늘어 좁은 화면에서는 선이 뭉개지고 매매 마커도 겹친다. 모바일에서만 최근 구간으로 자른다.
//
// 차트가 history 를 여러 번 훑지만(라인 3 개·매매 마커·툴팁) 모두 같은 배열을 보므로,
// 이 배열 하나만 자르면 마커와 툴팁의 범위도 함께 맞는다.

// 스냅샷이 하루 한 점이므로 개수가 곧 일수다.
/** 모바일에서 보여줄 일수. */
export const MOBILE_CHART_DAYS = 30;
/** 데스크톱에서 보여줄 일수 — 최근 3 개월. */
export const DESKTOP_CHART_DAYS = 90;

/**
 * 화면에 맞는 최근 구간만 남긴다 — 모바일 30 일, 데스크톱 90 일.
 *
 * 자를 것이 없으면 **받은 배열을 그대로 돌려준다.** 참조가 유지되어야 useMemo 가 헛돌지 않는다.
 *
 * @param days 직접 지정(테스트·특수 화면). 미지정이면 화면에 따라 정한다.
 */
export function recentPoints<T>(points: T[], isMobile: boolean, days?: number): T[] {
  const limit = days ?? (isMobile ? MOBILE_CHART_DAYS : DESKTOP_CHART_DAYS);
  if (points.length <= limit) return points;
  return points.slice(-limit);
}
