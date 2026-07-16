/**
 * 매매기록 멱등키용 `time` 정규화 — 초 단위로 절삭한다.
 *
 * 같은 체결이라도 등록 경로마다 `time` 포맷이 달랐다:
 *   - 파이썬 site_sync(과거): 마이크로초  `...T22:41:00.027475`
 *   - 주문시점 recordChartTrade(제거됨): JS 밀리초+Z `...T13:44:11.257Z`
 *   - 사이트 close-sync(현행 정본): 초단위 `...T22:41:00`
 *
 * ingest 멱등키는 `{env, ticker, time}` 문자열 정확일치라, 소수점 이하가 다르면
 * 같은 체결이 별건으로 중복 저장됐다. 초 단위로 맞춰 그 재발을 막는다.
 * (KIS 체결시각 해상도가 초라, 초 절삭으로 정보 손실 없음.)
 */
export function normalizeTradeTime(t: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(t);
  return m ? m[1] : t;
}
