// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import DarkClassSync from './dark-class-sync';

// window.matchMedia mock
function mockMatchMedia(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mq = {
    matches,
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    dispatchChange: (newMatches: boolean) => {
      listeners.forEach((cb) => cb({ matches: newMatches } as MediaQueryListEvent));
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mq);
  return mq;
}

describe('DarkClassSync', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('시스템이 다크 모드이면 마운트 시 dark 클래스를 추가한다', () => {
    mockMatchMedia(true);
    render(<DarkClassSync />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('시스템이 라이트 모드이면 마운트 시 dark 클래스를 추가하지 않는다', () => {
    mockMatchMedia(false);
    render(<DarkClassSync />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('시스템 테마 변경 이벤트에 반응해 dark 클래스를 토글한다', () => {
    const mq = mockMatchMedia(false);
    render(<DarkClassSync />);

    mq.dispatchChange(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    mq.dispatchChange(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('언마운트 시 이벤트 리스너를 제거한다', () => {
    const mq = mockMatchMedia(false);
    const { unmount } = render(<DarkClassSync />);
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalled();
  });
});
