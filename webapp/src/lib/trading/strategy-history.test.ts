// #83 — 포트폴리오 전략 변경 이력.
//
// #77 에서 매매기록의 전략 태그가 통째로 덮였을 때, 되돌리려니 "언제 어떤 전략에서 어떤
// 전략으로 바뀌었는지" 기록이 없어 매매 패턴을 보고 추론해야 했다. 다음에는 기록을 보게 한다.
import { describe, it, expect } from 'vitest';
import { appendStrategyChange, type StrategyChange } from './strategy-history';

const at = (s: string) => new Date(s);

describe('appendStrategyChange', () => {
  it('최초 생성이면 그 전략이 첫 항목이 된다', () => {
    expect(appendStrategyChange([], undefined, 'rotation_v1', at('2026-07-18T00:00:00Z')))
      .toEqual([{ strategy: 'rotation_v1', changedAt: at('2026-07-18T00:00:00Z') }]);
  });

  it('전략이 바뀌면 한 줄 덧붙인다', () => {
    const prev: StrategyChange[] = [{ strategy: 'rotation_v1', changedAt: at('2026-07-18T00:00:00Z') }];
    expect(appendStrategyChange(prev, 'rotation_v1', 'infinite_v4', at('2026-08-10T13:36:00Z')))
      .toEqual([
        { strategy: 'rotation_v1', changedAt: at('2026-07-18T00:00:00Z') },
        { strategy: 'infinite_v4', changedAt: at('2026-08-10T13:36:00Z') },
      ]);
  });

  // 저장 버튼만 눌러도 upsert 가 도는데, 그때마다 같은 줄이 쌓이면 이력이 쓸모없어진다.
  it('전략이 그대로면 아무것도 하지 않는다', () => {
    const prev: StrategyChange[] = [{ strategy: 'infinite_v4', changedAt: at('2026-08-10T13:36:00Z') }];
    expect(appendStrategyChange(prev, 'infinite_v4', 'infinite_v4', at('2026-08-11T00:00:00Z')))
      .toBe(prev);
  });

  // 이력이 비어 있는 옛 문서를 저장할 때 — 이전 전략이 있으면 그것부터 심는다.
  it('이력이 비었는데 이전 전략이 있으면 둘 다 남긴다', () => {
    const out = appendStrategyChange([], 'rotation_v1', 'infinite_v4', at('2026-08-10T13:36:00Z'));
    expect(out.map((h) => h.strategy)).toEqual(['rotation_v1', 'infinite_v4']);
    // 이전 전략의 시점은 알 수 없으므로 같은 시각으로 둔다(근사).
    expect(out[0].changedAt).toEqual(at('2026-08-10T13:36:00Z'));
  });

  it('원본 배열을 변형하지 않는다', () => {
    const prev: StrategyChange[] = [{ strategy: 'rotation_v1', changedAt: at('2026-07-18T00:00:00Z') }];
    appendStrategyChange(prev, 'rotation_v1', 'infinite_v4', at('2026-08-10T13:36:00Z'));
    expect(prev).toHaveLength(1);
  });
});
