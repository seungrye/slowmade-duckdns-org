// web-adventure analytics 헬퍼 (#245).
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => ({
  getFirebaseAnalytics: vi.fn(),
}));
vi.mock('firebase/analytics', () => ({
  logEvent: vi.fn(),
}));

import { getFirebaseAnalytics } from '@/lib/firebase';
import { logEvent } from 'firebase/analytics';
import { logAdvEvent } from './analytics';

describe('logAdvEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST';
  });

  it('analytics 인스턴스가 있으면 logEvent 호출 (prefix adv_)', async () => {
    const fakeAnalytics = { app: 'mock' };
    (getFirebaseAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAnalytics);
    logAdvEvent('run_started', { ability: 'scholar' });
    // 마이크로태스크 await
    await new Promise((r) => setTimeout(r, 0));
    expect(logEvent).toHaveBeenCalledWith(fakeAnalytics, 'adv_run_started', { ability: 'scholar' });
  });

  it('measurement_id 환경 변수 없으면 호출 skip', async () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
    logAdvEvent('run_started', {});
    await new Promise((r) => setTimeout(r, 0));
    expect(getFirebaseAnalytics).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('analytics 인스턴스 없음 → silent', async () => {
    (getFirebaseAnalytics as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    logAdvEvent('choice_made', { sceneId: 'x' });
    await new Promise((r) => setTimeout(r, 0));
    expect(logEvent).not.toHaveBeenCalled();
  });
});
