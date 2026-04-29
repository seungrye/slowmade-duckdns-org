// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('@/lib/firebase', () => ({
  getFirebaseAnalytics: vi.fn().mockResolvedValue({ name: 'analytics' }),
}));

vi.mock('firebase/analytics', () => ({
  logEvent: vi.fn(),
}));

import PostScrollDepth from './post-scroll-depth';
import { logEvent } from 'firebase/analytics';

function setScrollPosition(scrollY: number, scrollHeight: number, innerHeight: number) {
  Object.defineProperty(window, 'scrollY', { value: scrollY, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, writable: true, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, writable: true, configurable: true });
}

describe('PostScrollDepth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setScrollPosition(0, 2000, 500);
  });

  it('마운트 시 초기 스크롤 위치를 즉시 계산한다', async () => {
    // 처음부터 100% 위치 (짧은 페이지)
    setScrollPosition(0, 500, 500);

    await act(async () => {
      render(<PostScrollDepth postId="post-1" postTitle="테스트 글" />);
    });

    await vi.waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(
        expect.anything(),
        'scroll_depth',
        expect.objectContaining({ percent_scrolled: 25 })
      );
    });
  });

  it('스크롤 50% 도달 시 이벤트를 전송한다', async () => {
    // scrollHeight=2000, innerHeight=500 → 50% = scrollY 500
    render(<PostScrollDepth postId="post-1" postTitle="테스트 글" />);

    await act(async () => {
      setScrollPosition(500, 2000, 500); // (500+500)/2000 = 50%
      window.dispatchEvent(new Event('scroll'));
    });

    await vi.waitFor(() => {
      const calls = (logEvent as ReturnType<typeof vi.fn>).mock.calls.map(
        ([, , params]) => params.percent_scrolled
      );
      expect(calls).toContain(50);
    });
  });

  it('같은 구간은 두 번 이상 이벤트를 전송하지 않는다', async () => {
    render(<PostScrollDepth postId="post-1" postTitle="테스트 글" />);

    await act(async () => {
      setScrollPosition(500, 2000, 500);
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
    });

    await vi.waitFor(() => {
      const fiftyPercentCalls = (logEvent as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([, , params]) => params.percent_scrolled === 50
      );
      expect(fiftyPercentCalls.length).toBe(1);
    });
  });

  it('post_id와 post_title을 이벤트 파라미터로 전송한다', async () => {
    setScrollPosition(0, 500, 500);

    await act(async () => {
      render(<PostScrollDepth postId="abc123" postTitle="내 첫 번째 글" />);
    });

    await vi.waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(
        expect.anything(),
        'scroll_depth',
        expect.objectContaining({
          post_id: 'abc123',
          post_title: '내 첫 번째 글',
        })
      );
    });
  });

  it('아무것도 렌더링하지 않는다', () => {
    const { container } = render(<PostScrollDepth postId="post-1" postTitle="테스트 글" />);
    expect(container.firstChild).toBeNull();
  });
});
