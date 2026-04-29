// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

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

describe('FirebaseAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MEASUREMENT_ID 없으면 Analytics를 초기화하지 않는다', async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
    render(<FirebaseAnalytics />);
    await vi.waitFor(() => {
      expect(getFirebaseAnalytics).not.toHaveBeenCalled();
    });
  });

  it('MEASUREMENT_ID 있으면 getFirebaseAnalytics를 호출한다', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST';
    render(<FirebaseAnalytics />);
    await vi.waitFor(() => {
      expect(getFirebaseAnalytics).toHaveBeenCalled();
    });
  });

  it('analytics 초기화 성공 시 page_view 이벤트를 전송한다', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST';
    render(<FirebaseAnalytics />);
    await vi.waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(
        expect.anything(),
        'page_view',
        { page_path: '/' }
      );
    });
  });

  it('아무것도 렌더링하지 않는다', () => {
    const { container } = render(<FirebaseAnalytics />);
    expect(container.firstChild).toBeNull();
  });
});
