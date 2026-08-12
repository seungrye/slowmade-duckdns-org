// 매매 차트의 표시 구간 (#95).
//
// /admin/portfolio 는 기간 선택이 없어 쌓인 스냅샷 전체를 그린다. 날이 갈수록 포인트가
// 늘어 좁은 화면에서는 선이 뭉개지고 매매 마커도 겹친다. 모바일에서만 최근 구간으로 자른다.
//
// 차트가 history 를 여러 번 훑지만(라인 3 개·매매 마커·툴팁) 모두 같은 배열을 보므로,
// 이 배열 하나만 자르면 마커와 툴팁의 범위도 함께 맞는다.

/** 모바일에서 보여줄 일수. 스냅샷이 하루 한 점이므로 곧 일수다. */
export const MOBILE_CHART_DAYS = 30;

/**
 * 모바일이면 뒤에서 `days` 개만 남긴다. 데스크톱이거나 이미 그보다 짧으면
 * **받은 배열을 그대로 돌려준다** — 참조가 유지되어야 useMemo 가 헛돌지 않는다.
 */
export function recentPoints<T>(points: T[], isMobile: boolean, days = MOBILE_CHART_DAYS): T[] {
  if (!isMobile || points.length <= days) return points;
  return points.slice(-days);
}
