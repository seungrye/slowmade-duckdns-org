// 한 표가 제대로 나가는가 (#475).
// @vitest-environment jsdom
//
// **게이트가 이 시험의 요점이다.** #469 에서 e2e 가 GA 를 오염시킨 적이 있는데,
// 그때 고친 게이트는 페이지뷰에만 걸려 있다. 이 표는 A/B 의 근거라 오염되면 결론이
// 통째로 틀리므로, 여기서만이라도 반드시 게이트를 거쳐야 한다.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const logAdvEvent = vi.fn();
const shouldTrackHere = vi.fn(() => true);

vi.mock('@/lib/web-adventure/analytics', () => ({ logAdvEvent }));
vi.mock('@/lib/analytics-gate', () => ({ shouldTrackHere }));

const { VOTE_KEY, readVotes, submitVote } = await import('./vote-sink');
const { buildVote } = await import('./ui-vote');

const vote = (overrides: Partial<Parameters<typeof buildVote>[0]> = {}) =>
  buildVote({
    variantId: 'rail:sigil',
    layout: 'rail',
    face: 'sigil',
    vote: 'up',
    endingId: 'harmony',
    protagonist: 'rin',
    cleared: true,
    erosion: 42,
    now: 1_700_000_000_000,
    ...overrides,
  });

describe('submitVote', () => {
  beforeEach(() => {
    window.localStorage.clear();
    logAdvEvent.mockClear();
    shouldTrackHere.mockClear();
    shouldTrackHere.mockReturnValue(true);
  });

  it('본인 기기에 남는다 — 서버가 없어도 읽을 수 있게', () => {
    submitVote(vote());
    expect(readVotes()).toHaveLength(1);
    expect(readVotes()[0]).toMatchObject({ variant: 'rail:sigil', vote: 'up' });
  });

  it('쌓인다 — 덮어쓰지 않는다', () => {
    submitVote(vote({ vote: 'up' }));
    submitVote(vote({ vote: 'down' }));
    expect(readVotes().map((v) => v.vote)).toEqual(['up', 'down']);
  });

  it('운영에서 사람이 볼 때만 센다', () => {
    submitVote(vote());
    expect(logAdvEvent).toHaveBeenCalledTimes(1);
    expect(logAdvEvent.mock.calls[0][0]).toBe('refine_ui_vote');
    expect(logAdvEvent.mock.calls[0][1]).toMatchObject({
      variant: 'rail:sigil',
      layout: 'rail',
      face: 'sigil',
      vote: 'up',
      cleared: true,
    });
  });

  it('게이트가 막으면 GA 로는 안 나간다 — e2e·localhost 가 통계를 더럽히면 안 된다', () => {
    shouldTrackHere.mockReturnValue(false);
    submitVote(vote());
    expect(logAdvEvent).not.toHaveBeenCalled();
    // 그래도 본인 기기에는 남는다 — 직접 견줘 보는 길은 막지 않는다.
    expect(readVotes()).toHaveLength(1);
  });

  it('저장이 막혀도 조용히 지나간다 — 표 하나에 엔딩 화면이 깨지면 안 된다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => submitVote(vote())).not.toThrow();
    // 저장은 실패해도 분석은 나간다 — 둘은 서로를 안 막는다.
    expect(logAdvEvent).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('readVotes — 망가진 저장본', () => {
  beforeEach(() => window.localStorage.clear());

  it('없으면 빈 배열', () => {
    expect(readVotes()).toEqual([]);
  });

  it('JSON 이 아니면 빈 배열', () => {
    window.localStorage.setItem(VOTE_KEY, '{어쩌구');
    expect(readVotes()).toEqual([]);
  });

  it('배열이 아니면 빈 배열', () => {
    window.localStorage.setItem(VOTE_KEY, '{"v":1}');
    expect(readVotes()).toEqual([]);
  });
});
