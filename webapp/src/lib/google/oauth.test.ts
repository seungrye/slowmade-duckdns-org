// 구글 access token 확보 (#181 2단계).
//
// access token 은 한 시간이면 죽는다. refresh token 으로 다시 받아 저장하되, 아직 살아 있으면
// 그대로 쓴다(불필요한 왕복과 구글 쪽 제한을 피한다).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  updated: [] as unknown[],
}));

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/google-oauth-token', () => ({
  default: {
    findOne: () => ({ lean: async () => h.doc }),
    updateOne: async (...args: unknown[]) => { h.updated.push(args); return { acknowledged: true }; },
  },
}));
// 실제 암복호는 키가 필요하니 여기선 통과시킨다 — 암호화 자체는 trading/crypto 테스트가 본다.
vi.mock('@/lib/trading/crypto', () => ({
  encryptSecret: (s: string) => `enc(${s})`,
  decryptSecret: (s: string) => s.replace(/^enc\(/, '').replace(/\)$/, ''),
}));
vi.mock('@/lib/env', () => ({
  env: { google: { clientId: 'cid', clientSecret: 'csec', sheetsExport: true } },
}));

import { getAccessToken } from './oauth';

const NOW = 1_800_000_000_000;

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.doc = null;
    h.updated.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('연동한 적이 없으면 null — 호출측이 "재로그인 필요"로 안내한다', async () => {
    expect(await getAccessToken('me@x.test')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('살아 있는 토큰은 그대로 쓴다 — 쓸데없이 갱신하지 않는다', async () => {
    h.doc = { refreshTokenEnc: 'enc(rt)', accessTokenEnc: 'enc(at)', expiresAt: NOW + 10 * 60_000 };
    expect(await getAccessToken('me@x.test')).toBe('at');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('곧 만료면 미리 갱신한다 — 쓰는 도중에 죽지 않게', async () => {
    // 30초 뒤 만료: 요청이 오가는 사이에 만료될 수 있다.
    h.doc = { refreshTokenEnc: 'enc(rt)', accessTokenEnc: 'enc(at)', expiresAt: NOW + 30_000 };
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: async () => ({ access_token: 'new-at', expires_in: 3600 }),
    } as Response);
    expect(await getAccessToken('me@x.test')).toBe('new-at');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('만료됐으면 refresh token 으로 새로 받아 저장한다', async () => {
    h.doc = { refreshTokenEnc: 'enc(rt)', accessTokenEnc: 'enc(old)', expiresAt: NOW - 1 };
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: async () => ({ access_token: 'fresh', expires_in: 3600 }),
    } as Response);

    expect(await getAccessToken('me@x.test')).toBe('fresh');

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = String((init as RequestInit).body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=rt');
    // 새 토큰은 암호화해서 저장한다.
    expect(JSON.stringify(h.updated)).toContain('enc(fresh)');
  });

  it('갱신 실패면 null — 매매 화면이 죽지 않고 안내만 뜬다', async () => {
    h.doc = { refreshTokenEnc: 'enc(rt)', accessTokenEnc: '', expiresAt: 0 };
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_grant' } as Response);
    expect(await getAccessToken('me@x.test')).toBeNull();
  });

  it('네트워크가 끊겨도 던지지 않는다', async () => {
    h.doc = { refreshTokenEnc: 'enc(rt)', accessTokenEnc: '', expiresAt: 0 };
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(getAccessToken('me@x.test')).resolves.toBeNull();
  });
});
