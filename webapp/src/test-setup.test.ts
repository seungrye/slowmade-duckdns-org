// @vitest-environment jsdom
// test-setup 이 jsdom 환경에서 해 줘야 할 일들 — 조용히 빠지면 알아채기 어렵다.
//
// jest-dom 은 node 환경 파일(288 중 221)이 매번 물 이유가 없어 `typeof window` 로 갈라
// 실었다(실측 setup 40s → 10s). 그 분기가 잘못되면 jsdom 테스트에서 매처가 통째로
// 사라지는데, 매처 없이 쓰면 "not a function" 으로 죽으니 티는 난다. 다만 어느 파일이
// 먼저 깨지는지가 매번 달라 원인을 찾기 어렵다 — 여기서 한 줄로 못 박는다.
import { describe, it, expect } from 'vitest';

describe('test-setup (jsdom)', () => {
  it('jest-dom 매처가 실려 있다', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
    expect(expect(el).toHaveTextContent).toBeTypeOf('function');
  });

  it('matchMedia 스텁이 있다 — useMobile() 이 마운트 시점에 부른다', () => {
    expect(window.matchMedia('(max-width: 640px)').matches).toBe(false);
  });

  it('ResizeObserver 스텁이 있다 — @xyflow/react 가 마운트 시점에 참조한다', () => {
    expect(typeof globalThis.ResizeObserver).toBe('function');
    new globalThis.ResizeObserver(() => {}).observe(document.body);
  });
});
