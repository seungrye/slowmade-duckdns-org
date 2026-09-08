// 엔딩 판정 (#419) — 덱 상태가 엔딩을 정한다는 설계의 중심.
//
// 여기서 확인하는 것은 "판정이 맞나"보다 **"판정 순서가 이야기와 맞나"**다.
// 굳었으면 무엇을 했든 석화여야 하고, 도시를 떨어뜨렸으면 그 뒤 사정은 의미가 없어야 한다.

import { describe, it, expect } from 'vitest';
import { resolveEnding, explainEnding, CITY_COLLAPSE_AT, SYLVAN_DECK_AT } from './ending';
import type { RunSummary } from './ending';
import { ENDING_IDS } from '@/types/web-adventure';

/** 아무 일도 없었던 회차 — 각 시험이 필요한 것만 덮어쓴다. */
function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    erosion: 30,
    crystalsLeft: 0,
    refined: 0,
    crystalsEverMade: 0,
    cityPower: 0,
    sylvanCards: 0,
    ally: null,
    cleared: true,
    ...over,
  };
}

describe('resolveEnding', () => {
  it('침식 100 이면 무엇을 했든 석화', () => {
    // 승천 조건(정제 9/10)도 함께 채워 두고 — 그래도 석화가 이겨야 한다.
    expect(resolveEnding(run({ erosion: 100, refined: 9, crystalsEverMade: 10 }))).toBe(
      'petrification',
    );
  });

  it('끝까지 못 갔으면 추락', () => {
    expect(resolveEnding(run({ cleared: false }))).toBe('fall');
  });

  it('판 연료가 도시를 키워 무너뜨리면 추락 — 승천 조건보다 먼저', () => {
    const s = run({ cityPower: CITY_COLLAPSE_AT, refined: 9, crystalsEverMade: 10 });
    expect(resolveEnding(s)).toBe('fall');
  });

  it('덱이 숲이 되면 영수의 유대', () => {
    expect(resolveEnding(run({ sylvanCards: SYLVAN_DECK_AT }))).toBe('sylvan_bond');
    expect(resolveEnding(run({ sylvanCards: SYLVAN_DECK_AT - 1 }))).not.toBe('sylvan_bond');
  });

  it('아이언가드와 손잡으면 혁명', () => {
    expect(resolveEnding(run({ ally: 'ironguard' }))).toBe('revolution');
  });

  it('결정의 절반 넘게 팔았으면 승천 — 스스로 연료가 된 것', () => {
    expect(resolveEnding(run({ refined: 5, crystalsEverMade: 10 }))).toBe('ascension');
    expect(resolveEnding(run({ refined: 4, crystalsEverMade: 10 }))).not.toBe('ascension');
  });

  it('결정을 하나도 만들지 않았으면 조화 — 가장 어려운 길', () => {
    expect(resolveEnding(run({ crystalsEverMade: 0 }))).toBe('harmony');
  });

  it('태웠지만 팔지 않았으면 방랑', () => {
    expect(resolveEnding(run({ refined: 1, crystalsEverMade: 10, crystalsLeft: 9 }))).toBe(
      'wayfarer',
    );
  });

  it('돌려주는 값은 항상 web-adventure 의 엔딩 목록 안에 있다', () => {
    // 이게 깨지면 나중에 PastRun 으로 흘려보낼 때 검증에서 통째로 버려진다 (#352 와 같은 사고).
    const cases = [
      run({ erosion: 100 }),
      run({ cleared: false }),
      run({ cityPower: 99 }),
      run({ sylvanCards: 9 }),
      run({ ally: 'ironguard' }),
      run({ refined: 9, crystalsEverMade: 10 }),
      run(),
      run({ refined: 1, crystalsEverMade: 10 }),
    ];
    for (const c of cases) {
      expect(ENDING_IDS).toContain(resolveEnding(c));
    }
  });
});

describe('explainEnding — 왜 그 엔딩인지 화면이 근거를 댄다', () => {
  it('승천이면 몇 장 중 몇 장을 팔았는지 말한다', () => {
    const s = run({ refined: 9, crystalsEverMade: 10 });
    expect(explainEnding(s, 'ascension')).toContain('9');
    expect(explainEnding(s, 'ascension')).toContain('10');
  });

  it('추락은 끝까지 갔는지에 따라 이유가 다르다', () => {
    expect(explainEnding(run({ cleared: false }), 'fall')).toContain('끝내지 못했다');
    expect(explainEnding(run({ cityPower: 9 }), 'fall')).toContain('도시');
  });
});
