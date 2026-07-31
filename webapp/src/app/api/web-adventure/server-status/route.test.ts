// /api/web-adventure/server-status — owner 게이팅 + shim 프록시 (#19)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { llmBaseUrl: 'http://127.0.0.1:8848/v1' } }));

import { GET } from './route';
import { requireOwner } from '@/lib/require-owner';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe('server-status route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비owner → 404', async () => {
    asMock(requireOwner).mockResolvedValue(NextResponse.json({}, { status: 404 }));
    expect((await GET()).status).toBe(404);
  });

  it('owner → shim /api/system·/api/state 프록시', async () => {
    asMock(requireOwner).mockResolvedValue({ email: 'owner@x.com' });
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes('/api/system') ? { cpu: { overall: 12 } } : { active: 'm1' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.system).toMatchObject({ cpu: { overall: 12 } });
    expect(body.data.state).toMatchObject({ active: 'm1' });
    // /v1 은 root 로 치환돼 /api/system 호출
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8848/api/system', expect.anything());
    vi.unstubAllGlobals();
  });

  it('shim 응답 실패 시 null 로 반환(throw 안 함)', async () => {
    asMock(requireOwner).mockResolvedValue({ email: 'owner@x.com' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('refused'); }));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.system).toBeNull();
    expect(body.data.state).toBeNull();
    vi.unstubAllGlobals();
  });
});
