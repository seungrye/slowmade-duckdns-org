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
  // system 테마 — prefers-color-scheme 감지
  describe('system 테마', () => {
    beforeEach(() => {
      document.documentElement.classList.remove('dark');
    });

    it('시스템이 다크 모드이면 마운트 시 dark 클래스를 추가한다', () => {
      mockMatchMedia(true);
      render(<ThemeSync initialTheme="system" />);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('시스템이 라이트 모드이면 마운트 시 dark 클래스를 추가하지 않는다', () => {
      mockMatchMedia(false);
      render(<ThemeSync initialTheme="system" />);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('시스템 테마 변경 이벤트에 반응해 dark 클래스를 토글한다', () => {
      const mq = mockMatchMedia(false);
      render(<ThemeSync initialTheme="system" />);

      mq.dispatchChange(true);
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      mq.dispatchChange(false);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('언마운트 시 이벤트 리스너를 제거한다', () => {
      const mq = mockMatchMedia(false);
      const { unmount } = render(<ThemeSync initialTheme="system" />);
      unmount();
      expect(mq.removeEventListener).toHaveBeenCalled();
    });
  });

  // 고정 테마 — prefers-color-scheme 무시
  // dark/light 테마는 .dark 클래스 기반으로 동작 (globals.css @custom-variant dark)
  // SSR에서 <html class="dark">로 이미 설정되므로 ThemeSync는 로그인 동기화만 담당
  describe('dark/light 테마', () => {
    beforeEach(() => {
      document.documentElement.classList.remove('dark');
    });

    it('dark 테마이면 시스템 변경 이벤트에 반응하지 않는다', () => {
      const mq = mockMatchMedia(false);
      render(<ThemeSync initialTheme="dark" />);

      mq.dispatchChange(false);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('light 테마이면 시스템이 다크여도 dark 클래스를 추가하지 않는다', () => {
      const mq = mockMatchMedia(true);
      render(<ThemeSync initialTheme="light" />);

      mq.dispatchChange(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  // 로그인 시 DB 테마 동기화
  describe('로그인 시 DB 테마 동기화', () => {
    beforeEach(() => {
      document.documentElement.classList.remove('dark');
      vi.clearAllMocks();
    });

    it('authenticated 상태가 되면 /api/user/settings 를 조회해 dark 테마를 적용한다', async () => {
      const { useSession } = await import('next-auth/react');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(useSession).mockReturnValue({ status: 'authenticated', data: null as any, update: vi.fn() });

      mockMatchMedia(false);
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { theme: 'dark' } }),
      } as Response);

      render(<ThemeSync initialTheme="system" />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });
    });

    it('authenticated 상태가 되면 /api/user/settings 를 조회해 light 테마를 적용한다', async () => {
      const { useSession } = await import('next-auth/react');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(useSession).mockReturnValue({ status: 'authenticated', data: null as any, update: vi.fn() });

      mockMatchMedia(true);
      document.documentElement.classList.add('dark');
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { theme: 'light' } }),
      } as Response);

      render(<ThemeSync initialTheme="system" />);

      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      });
    });
  });
});
