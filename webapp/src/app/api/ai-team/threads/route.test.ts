// AI 팀 요청 스레드 목록 (#207).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockEnv = vi.hoisted(() => ({ aiTeamKey: '', ownerEmail: '' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockPostFind = vi.hoisted(() => vi.fn());
vi.mock('@/models/post', () => ({ default: { find: mockPostFind } }));

import { GET } from './route';

/** mongoose 체인 목 — select/sort/limit 를 지나 lean 에서 결과를 낸다. */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.sort = vi.fn(() => c);
  c.limit = vi.fn(() => c);
  c.lean = vi.fn(async () => result);
  return c;
}

function req(key?: string) {
  return new NextRequest('http://localhost/api/ai-team/threads', {
    headers: key === undefined ? {} : { 'x-ai-team-key': key },
  });
}

const POSTS = [
  { _id: 'p1', title: '검색 기능 붙여줘', tags: ['ai-req'], createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z' },
];

describe('GET /api/ai-team/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.aiTeamKey = 'secret-key';
    mockEnv.ownerEmail = 'owner@x.test';
    mockPostFind.mockReturnValue(chain(POSTS));
  });

  it('키가 없으면 404 — DB 에 닿지도 않는다', async () => {
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(mockPostFind).not.toHaveBeenCalled();
  });

  it('키가 틀리면 404', async () => {
    const res = await GET(req('wrong'));
    expect(res.status).toBe(404);
    expect(mockPostFind).not.toHaveBeenCalled();
  });

  it('OWNER_EMAIL 이 없으면 404 — 열어 줄 대상이 없다', async () => {
    mockEnv.ownerEmail = '';
    const res = await GET(req('secret-key'));
    expect(res.status).toBe(404);
    expect(mockPostFind).not.toHaveBeenCalled();
  });

  it('정상이면 요청 목록을 돌려준다', async () => {
    const res = await GET(req('secret-key'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toMatchObject({ postId: 'p1', title: '검색 기능 붙여줘' });
  });

  // 이 필터가 AI 에게 열리는 범위 전부다.
  it('조회 필터에 삼중 조건이 모두 들어간다', async () => {
    await GET(req('secret-key'));
    expect(mockPostFind).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: 'owner@x.test',
        isPrivate: true,
        isDeleted: { $ne: true },
        tags: expect.any(RegExp),
      }),
    );
  });

  it('본문(htmlContent)은 목록에 싣지 않는다', async () => {
    const res = await GET(req('secret-key'));
    const json = await res.json();
    expect(json.data[0]).not.toHaveProperty('htmlContent');
    expect(json.data[0]).not.toHaveProperty('userEmail');
  });
});
