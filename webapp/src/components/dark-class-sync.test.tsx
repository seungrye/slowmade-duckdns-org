// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import ThemeSync from './dark-class-sync';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ status: 'unauthenticated' })),
}));

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

describe('ThemeSync', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.clearAllMocks();
  });

  // The initial theme is read from localStorage (not a cookie or a prop).
  describe('localStorage 초기 테마 (system)', () => {
    it('시스템이 다크면 마운트 시 dark 클래스를 추가한다', () => {
      localStorage.setItem('theme', 'system');
      mockMatchMedia(true);
      render(<ThemeSync />);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('시스템이 라이트면 dark 클래스를 추가하지 않는다', () => {
      localStorage.setItem('theme', 'system');
      mockMatchMedia(false);
      render(<ThemeSync />);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('저장값이 없으면 system 으로 폴백한다', () => {
      mockMatchMedia(true);
      render(<ThemeSync />);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('시스템 테마 변경 이벤트에 반응해 토글한다', () => {
      localStorage.setItem('theme', 'system');
      const mq = mockMatchMedia(false);
      render(<ThemeSync />);

      mq.dispatchChange(true);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      mq.dispatchChange(false);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('언마운트 시 리스너를 제거한다', () => {
      localStorage.setItem('theme', 'system');
      const mq = mockMatchMedia(false);
      const { unmount } = render(<ThemeSync />);
      unmount();
      expect(mq.removeEventListener).toHaveBeenCalled();
    });
  });

  // A fixed theme (dark/light) is applied by the client on mount (SSR does not know the theme).
  describe('고정 테마 (dark/light)', () => {
    it('dark 면 마운트 시 dark 를 붙이고 시스템 변경을 무시한다', () => {
      localStorage.setItem('theme', 'dark');
      const mq = mockMatchMedia(false);
      render(<ThemeSync />);
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      mq.dispatchChange(false);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('light 면 시스템이 다크여도 dark 를 붙이지 않는다', () => {
      localStorage.setItem('theme', 'light');
      const mq = mockMatchMedia(true);
      render(<ThemeSync />);
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      mq.dispatchChange(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  // While logged in, localStorage is refreshed from the DB (user.settings.theme) as the source and applied.
  describe('로그인 시 DB 테마 동기화', () => {
    async function authenticate() {
      const { useSession } = await import('next-auth/react');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(useSession).mockReturnValue({ status: 'authenticated', data: null as any, update: vi.fn() });
    }

    it('DB dark 를 적용하고 localStorage 를 갱신한다', async () => {
      await authenticate();
      mockMatchMedia(false);
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { theme: 'dark' } }),
      } as Response);

      render(<ThemeSync />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });
      expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('DB light 를 적용하고 localStorage 를 갱신한다', async () => {
      await authenticate();
      mockMatchMedia(true);
      document.documentElement.classList.add('dark');
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { theme: 'light' } }),
      } as Response);

      render(<ThemeSync />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      });
      expect(localStorage.getItem('theme')).toBe('light');
    });
  });
});
