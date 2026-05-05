import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'mock-app' })),
  getApps: vi.fn(() => []),
}));

vi.mock('firebase/analytics', () => ({
  initializeAnalytics: vi.fn(() => ({ name: 'mock-analytics' })),
  isSupported: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('firebase/performance', () => ({
  getPerformance: vi.fn(() => ({ name: 'mock-performance' })),
}));

describe('firebase.ts — 설정 누락 방어 처리', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('projectId/appId 누락 시 console.warn을 출력한다', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = '';
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await import('@/lib/firebase');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Firebase]'));
    warnSpy.mockRestore();
  });

  it('설정 누락 시 getFirebasePerformance는 null을 반환한다', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = '';
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getFirebasePerformance } = await import('@/lib/firebase');

    expect(getFirebasePerformance()).toBeNull();
  });

  it('설정 누락 시 getFirebaseAnalytics는 null로 resolve된다', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = '';
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '';
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getFirebaseAnalytics } = await import('@/lib/firebase');

    await expect(getFirebaseAnalytics()).resolves.toBeNull();
  });

  it('설정이 있으면 getFirebaseAnalytics는 analytics 객체를 반환한다', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:123:web:abc';

    const { getFirebaseAnalytics } = await import('@/lib/firebase');

    await expect(getFirebaseAnalytics()).resolves.not.toBeNull();
  });
});
