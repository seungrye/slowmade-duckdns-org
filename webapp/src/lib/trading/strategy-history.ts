// 포트폴리오 전략 변경 이력 — 순수 함수 (#83).
//
// 포트폴리오는 계정·시장당 문서 하나뿐이고, 전략을 갈아탈 때 strategy 필드를 덮어쓴다.
// 그래서 "언제 무엇에서 무엇으로 바뀌었는지" 가 어디에도 남지 않았다.
//
// #77 에서 매매기록의 전략 태그가 통째로 덮였을 때 이 기록이 없어, 되돌리려니 매매 패턴을
// 보고 추론해야 했다("S&P 31 종목을 소량 분산 매수 후 일괄 청산 → 추세추종일 것"). 근거는
// 충분했지만 늘 그런 단서가 있으리라는 보장은 없다. 다음에는 기록을 보게 한다.

export interface StrategyChange {
  strategy: string;
  changedAt: Date;
}

/**
 * 전략이 바뀌었으면 이력에 한 줄 덧붙인 새 배열을, 그대로면 받은 배열을 그대로 돌려준다.
 *
 * 저장 버튼만 눌러도 upsert 가 도므로 **같으면 아무것도 하지 않는** 것이 중요하다.
 * 그러지 않으면 같은 줄이 쌓여 이력이 쓸모없어진다.
 *
 * @param history 지금까지의 이력(오래된 것부터)
 * @param prev    저장 전 전략. 신규 생성이면 undefined
 * @param next    저장하려는 전략
 * @param at      변경 시각
 */
export function appendStrategyChange(
  history: StrategyChange[],
  prev: string | undefined,
  next: string,
  at: Date,
): StrategyChange[] {
  if (prev === next) return history;

  // 이력이 비었는데 이전 전략이 있는 경우 = 이 기능이 생기기 전부터 있던 문서다.
  // 그 전략이 언제 시작됐는지는 알 수 없으므로 같은 시각으로 심어 둔다(근사).
  const seed: StrategyChange[] =
    history.length === 0 && prev ? [{ strategy: prev, changedAt: at }] : [];

  return [...history, ...seed, { strategy: next, changedAt: at }];
}
