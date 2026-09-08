// @vitest-environment jsdom
// What test-setup has to do under the jsdom environment - a silent omission is hard to notice.
//
// jest-dom has no reason to be pulled in by every node-environment file (221 of 288), so it is loaded behind a `typeof window`
// branch (measured: setup 40s -> 10s). Get that branch wrong and the matchers vanish entirely from the jsdom
// tests - using one without a matcher dies with "not a function", so it does show. But which file
// breaks first varies every time and the cause is hard to find - so it is pinned down here in one line.
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
