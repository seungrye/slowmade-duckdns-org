// 조작 평가 한 표 (#475).
//
// 여기서 보는 것은 **표가 조합과 회차를 같이 들고 다니는가**다. 변종만 담으면
// 「👎 3표」에서 멈추고, 진 판의 불만인지 조작의 불만인지 못 가른다.

import { describe, it, expect } from 'vitest';
import { buildVote, tally, type VoteRecord } from './ui-vote';

const base = {
  variantId: 'rail:sigil',
  layout: 'rail',
  face: 'sigil',
  endingId: 'harmony' as const,
  protagonist: 'rin' as const,
  cleared: true,
  erosion: 42,
  now: 1_700_000_000_000,
};

describe('buildVote', () => {
  it('조합과 회차를 함께 싣는다 — 둘을 갈라 봐야 결론이 나온다', () => {
    expect(buildVote({ ...base, vote: 'up' })).toEqual({
      v: 1,
      variant: 'rail:sigil',
      layout: 'rail',
      face: 'sigil',
      vote: 'up',
      endingId: 'harmony',
      protagonist: 'rin',
      cleared: true,
      erosion: 42,
      ts: 1_700_000_000_000,
    });
  });

  it('시계를 모른다 — 부르는 쪽이 준다', () => {
    const a = buildVote({ ...base, vote: 'down', now: 1 });
    const b = buildVote({ ...base, vote: 'down', now: 2 });
    expect(a.ts).toBe(1);
    expect(b.ts).toBe(2);
    expect({ ...a, ts: 0 }).toEqual({ ...b, ts: 0 });
  });

  it('진 판도 담는다 — 조작 탓과 회차 탓을 가르는 열쇠다', () => {
    const lost = buildVote({ ...base, vote: 'down', cleared: false, endingId: 'fall' });
    expect(lost.cleared).toBe(false);
    expect(lost.endingId).toBe('fall');
  });
});

describe('tally — 쌓인 표 읽기', () => {
  const votes: VoteRecord[] = [
    buildVote({ ...base, vote: 'up' }),
    buildVote({ ...base, vote: 'up' }),
    buildVote({ ...base, vote: 'down' }),
    buildVote({ ...base, variantId: 'fan:plain', layout: 'fan', face: 'plain', vote: 'down' }),
  ];

  it('조합별로 찬반을 센다', () => {
    const t = tally(votes);
    expect(t.get('rail:sigil')).toEqual({ up: 2, down: 1 });
    expect(t.get('fan:plain')).toEqual({ up: 0, down: 1 });
  });

  it('표가 없는 조합은 아예 안 나온다 — 0/0 을 비율로 읽는 실수를 막는다', () => {
    expect(tally(votes).has('grid:index')).toBe(false);
  });

  it('빈 입력이면 빈 결과', () => {
    expect(tally([]).size).toBe(0);
  });
});
