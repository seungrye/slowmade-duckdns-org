/**
 * 실주문 스위치(liveEnabled) 변경 이력 — **순수** (#493).
 *
 * 포트폴리오 설정은 `TradingPortfolioRevision` 이 값 전체를 남긴다(#350 — config 가 통째로
 * 덮여 사라진 뒤 만든 것). 그런데 **실계좌 전환의 마지막 관문**인 이 토글은 이력이 없었다.
 * 서버 게이트(`TRADING_LIVE_ALLOWED`)가 이미 켜져 있으니, 이게 켜지는 순간 주문이 나간다.
 *
 * 불리언 하나라 별도 Revision 모델을 만들 크기가 아니다 — 계정 문서에 상한 있는 배열로 붙인다.
 */

export type LiveLogEntry = { at: Date; by: string; enabled: boolean };

/** 기본 보관 개수. 토글은 자주 만지는 값이 아니라 이 정도면 사실상 전부 남는다. */
export const LIVE_LOG_MAX = 50;

/**
 * 이번 요청이 남길 항목. **값이 실제로 바뀔 때만** 만든다 — 메모만 고치는 PUT 이나
 * 같은 값 재전송으로 로그가 불어나면 이력이 쓸모없어진다.
 * `next` 가 불리언이 아니면(필드 미전달 등) 변경이 아니다.
 */
export function liveChangeEntry(
  prev: boolean | null | undefined, next: unknown, by: string, at: Date,
): LiveLogEntry | null {
  if (typeof next !== "boolean") return null;
  if (Boolean(prev) === next) return null;
  return { at, by, enabled: next };
}

/** 상한 있는 append — 오래된 것부터 떨어진다. 원본 불변. */
export function appendLiveLog(
  log: LiveLogEntry[] | null | undefined, entry: LiveLogEntry, max = LIVE_LOG_MAX,
): LiveLogEntry[] {
  return [...(log ?? []), entry].slice(-max);
}
