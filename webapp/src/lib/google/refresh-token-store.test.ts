// 구글 refresh token 보관 (#181 2단계).
//
// 가장 조심할 곳: **토큰이 안 왔을 때 기존 값을 지우지 않는 것.** 구글은 첫 동의 때만
// refresh token 을 주므로, 그 다음 로그인마다 빈 값으로 덮으면 연동이 조용히 끊긴다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] as unknown[], fail: false }));

vi.mock('@/models/google-oauth-token', () => ({
  default: {
    updateOne: async (...args: unknown[]) => {
      if (h.fail) throw new Error('DB down');
      h.calls.push(args);
      return { acknowledged: true };
    },
  },
}));
vi.mock('@/lib/trading/crypto', () => ({ encryptSecret: (s: string) => `enc(${s})` }));

import { saveGoogleRefreshToken } from './refresh-token-store';

const google = (over = {}) => ({ provider: 'google', refresh_token: 'rt', scope: 'openid drive.file', ...over });

describe('saveGoogleRefreshToken', () => {
  beforeEach(() => { h.calls.length = 0; h.fail = false; });

  it('구글이 토큰을 주면 암호화해 저장한다', async () => {
    expect(await saveGoogleRefreshToken('me@x.test', google())).toBe(true);
    const [filter, update, opts] = h.calls[0] as [unknown, Record<string, Record<string, unknown>>, unknown];
    expect(filter).toEqual({ userEmail: 'me@x.test' });
    expect(update.$set.refreshTokenEnc).toBe('enc(rt)');
    expect(update.$set.scope).toContain('drive.file');
    expect(opts).toEqual({ upsert: true });
  });

  it('예전 access token 은 버린다 — 범위가 달라졌을 수 있다', async () => {
    await saveGoogleRefreshToken('me@x.test', google());
    const [, update] = h.calls[0] as [unknown, Record<string, Record<string, unknown>>];
    expect(update.$set.accessTokenEnc).toBe('');
    expect(update.$set.expiresAt).toBe(0);
  });

  // 여기가 핵심이다.
  it('토큰이 안 오면 아무것도 쓰지 않는다 — 기존 연동을 지우면 안 된다', async () => {
    expect(await saveGoogleRefreshToken('me@x.test', google({ refresh_token: null }))).toBe(false);
    expect(await saveGoogleRefreshToken('me@x.test', google({ refresh_token: undefined }))).toBe(false);
    expect(await saveGoogleRefreshToken('me@x.test', google({ refresh_token: '' }))).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('구글이 아닌 로그인은 건드리지 않는다', async () => {
    expect(await saveGoogleRefreshToken('me@x.test', google({ provider: 'github' }))).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('이메일이 없으면 저장하지 않는다', async () => {
    expect(await saveGoogleRefreshToken(null, google())).toBe(false);
    expect(await saveGoogleRefreshToken(undefined, google())).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('account 가 없어도 터지지 않는다', async () => {
    await expect(saveGoogleRefreshToken('me@x.test', null)).resolves.toBe(false);
  });

  // 시트 내보내기 때문에 로그인이 막히면 안 된다.
  it('저장이 실패해도 던지지 않는다 — 로그인을 막지 않는다', async () => {
    h.fail = true;
    await expect(saveGoogleRefreshToken('me@x.test', google())).resolves.toBe(false);
  });
});
