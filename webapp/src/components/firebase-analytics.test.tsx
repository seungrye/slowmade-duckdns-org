// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('@/lib/firebase', () => ({
  getFirebaseAnalytics: vi.fn().mockResolvedValue({ name: 'analytics' }),
}));

vi.mock('firebase/analytics', () => ({
  logEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/'),
}));

import FirebaseAnalytics from './firebase-analytics';
import { getFirebaseAnalytics } from '@/lib/firebase';
import { logEvent } from 'firebase/analytics';

/**
 * jsdom 의 호스트는 `localhost` 라 기본적으로 **안 쏜다** (#469). 그게 의도다 — 운영
 * 호스트에서 사람이 볼 때만 센다. 그래서 "쏘는" 경우를 보려면 호스트를 운영 것으로
 * 바꿔 줘야 한다.
 */
function atHost(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, href: `https://${hostname}/` },
  });
}

const atProductionHost = () => atHost('slowmade.duckdns.org');
/** jsdom 기본값으로 되돌린다. **매 시험 앞에서** 부른다 — 순서에 기대면 안 된다. */
const atLocalHost = () => atHost('localhost');

describe('FirebaseAnalytics', () => {
  beforeEach(() => {
    // 앞 시험이 바꿔 둔 호스트·자동화 플래그가 남지 않게 (#469).
    atLocalHost();
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
    vi.clearAllMocks();
  });

  it('MEASUREMENT_ID 없으면 Analytics를 초기화하지 않는다', async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
    render(<FirebaseAnalytics />);
    await vi.waitFor(() => {
      expect(getFirebaseAnalytics).not.toHaveBeenCalled();
    });
  });

  it('운영 호스트에서 MEASUREMENT_ID 있으면 getFirebaseAnalytics를 호출한다', async () => {
    atProductionHost();
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST';
    render(<FirebaseAnalytics />);
    await vi.waitFor(() => {
      expect(getFirebaseAnalytics).toHaveBeenCalled();
    });
  });

  it('analytics 초기화 성공 시 page_view 이벤트를 page_path, page_title, page_location과 함께 전송한다', async () => {
    atProductionHost();
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST';
    render(<FirebaseAnalytics />);
    await vi.waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(
        expect.anything(),
        'page_view',
        expect.objectContaining({
          page_path: '/',
          page_title: expect.any(String),
          page_location: expect.any(String),
        })
      );
    });
  });

  it('로컬에서는 MEASUREMENT_ID 가 있어도 안 쏜다 — e2e 가 통계를 더럽히던 자리 (#469)', async () => {
    // jsdom 기본 호스트가 localhost 다. 호스트를 안 바꾼다 = 로컬에서 연 것.
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST';
    render(<FirebaseAnalytics />);
    await act(async () => {});
    expect(getFirebaseAnalytics).not.toHaveBeenCalled();
  });

  it('자동화 브라우저면 운영 호스트라도 안 쏜다 (#469)', async () => {
    atProductionHost();
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true });
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST';
    render(<FirebaseAnalytics />);
    await act(async () => {});
    expect(getFirebaseAnalytics).not.toHaveBeenCalled();
  });

  it('아무것도 렌더링하지 않는다', () => {
    const { container } = render(<FirebaseAnalytics />);
    expect(container.firstChild).toBeNull();
  });
});
