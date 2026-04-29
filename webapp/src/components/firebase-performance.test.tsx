// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/firebase', () => ({
  getFirebasePerformance: vi.fn().mockReturnValue({ name: 'performance' }),
}));

import FirebasePerformance from './firebase-performance';
import { getFirebasePerformance } from '@/lib/firebase';

describe('FirebasePerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('마운트 시 getFirebasePerformance를 호출한다', async () => {
    render(<FirebasePerformance />);
    await vi.waitFor(() => {
      expect(getFirebasePerformance).toHaveBeenCalled();
    });
  });

  it('아무것도 렌더링하지 않는다', () => {
    const { container } = render(<FirebasePerformance />);
    expect(container.firstChild).toBeNull();
  });
});
