// 여러 zip 을 올렸을 때 무엇이 게임(클론)이고 무엇이 부모인지 (#143).
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
    // 병합은 **일반적인 것부터** 쌓아야 구체적인 것이 이긴다.
    expect(r.parents).toEqual(['dd.zip', 'ddsom.zip']);
  });

  it('하나만 주면 그것이 게임이다 — 완전 셋', () => {
    const r = classifyRomSet(['ssf2t.zip']);
    expect(r.game).toBe('ssf2t.zip');
    expect(r.parents).toEqual([]);
    expect(r.ambiguous).toBe(false);
  });

  // 규칙에 안 맞으면 조용히 찍지 않는다 — 리전이 엉뚱하게 잡히면 알아채기 어렵다.
  it('앞가지 관계가 아니면 ambiguous 로 표시한다', () => {
    const r = classifyRomSet(['ssf2t.zip', 'vsav.zip']);
    expect(r.ambiguous).toBe(true);
    expect(r.game).toBeTruthy(); // 그래도 하나는 고른다(가장 긴 이름)
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
