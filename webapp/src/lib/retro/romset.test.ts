// Which of several uploaded zips is the game (the clone) and which is the parent (#143).
import { describe, it, expect } from 'vitest';
import { classifyRomSet } from './romset';

describe('classifyRomSet', () => {
  it('이름이 앞가지인 쪽이 부모다 — MAME·FBA 의 작명 규칙', () => {
    const r = classifyRomSet(['ddsom.zip', 'ddsoma.zip']);
    expect(r.game).toBe('ddsoma.zip');
    expect(r.parents).toEqual(['ddsom.zip']);
    expect(r.ambiguous).toBe(false);
  });

  it('고른 순서와 무관하다', () => {
    expect(classifyRomSet(['ddsoma.zip', 'ddsom.zip']).game).toBe('ddsoma.zip');
  });

  it('부모가 여럿이어도 된다 — 긴 것이 게임', () => {
    const r = classifyRomSet(['dd.zip', 'ddsom.zip', 'ddsoma.zip']);
    expect(r.game).toBe('ddsoma.zip');
    // Merging must stack **from the general upward** so the specific wins.
    expect(r.parents).toEqual(['dd.zip', 'ddsom.zip']);
  });

  it('하나만 주면 그것이 게임이다 — 완전 셋', () => {
    const r = classifyRomSet(['ssf2t.zip']);
    expect(r.game).toBe('ssf2t.zip');
    expect(r.parents).toEqual([]);
    expect(r.ambiguous).toBe(false);
  });

  // If the rule does not fit, nothing is guessed quietly - a wrongly chosen region is hard to notice.
  it('앞가지 관계가 아니면 ambiguous 로 표시한다', () => {
    const r = classifyRomSet(['ssf2t.zip', 'vsav.zip']);
    expect(r.ambiguous).toBe(true);
    expect(r.game).toBeTruthy(); // it still picks one (the longest name)
  });

  it('대소문자·확장자를 가리지 않는다', () => {
    const r = classifyRomSet(['DDSOM.ZIP', 'ddsoma.zip']);
    expect(r.game).toBe('ddsoma.zip');
    expect(r.parents).toEqual(['DDSOM.ZIP']);
  });

  it('빈 목록은 안전하게 다룬다', () => {
    const r = classifyRomSet([]);
    expect(r.game).toBeNull();
    expect(r.parents).toEqual([]);
  });

  it('같은 이름이 둘이면 ambiguous', () => {
    expect(classifyRomSet(['a.zip', 'a.zip']).ambiguous).toBe(true);
  });

  it('사람이 읽을 설명을 준다 — 화면에 그대로 보여 준다', () => {
    const r = classifyRomSet(['ddsom.zip', 'ddsoma.zip']);
    expect(r.summary).toContain('ddsoma.zip');
    expect(r.summary).toContain('ddsom.zip');
  });
});
