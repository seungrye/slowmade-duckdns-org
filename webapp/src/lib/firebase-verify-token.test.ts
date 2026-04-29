import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyFirebaseIdToken } from './firebase-verify-token';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('verifyFirebaseIdToken', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-api-key');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('유효한 토큰이면 이메일을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [{ email: 'user@example.com' }] }),
    });

    expect(await verifyFirebaseIdToken('valid-token')).toBe('user@example.com');
  });

  it('API 오류 응답이면 null을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    expect(await verifyFirebaseIdToken('bad-token')).toBeNull();
  });

  it('네트워크 오류이면 null을 반환한다', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    expect(await verifyFirebaseIdToken('any-token')).toBeNull();
  });

  it('API_KEY가 없으면 fetch 없이 null을 반환한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', '');

    expect(await verifyFirebaseIdToken('any-token')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('users 배열이 비어있으면 null을 반환한다', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: [] }),
    });

    expect(await verifyFirebaseIdToken('empty-users-token')).toBeNull();
  });
});
