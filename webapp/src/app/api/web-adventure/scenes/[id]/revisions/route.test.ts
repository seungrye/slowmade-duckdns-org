// /api/web-adventure/scenes/[id]/revisions — 목록 GET 테스트.
//
// snapshot 은 *제외* (가벼움). 목록 표시용 최소 필드 (_id, version, createdAt, author).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/web-adventure-scene-revision', () => ({
  default: { find: vi.fn() },
}));

import { GET } from './route';
import WebAdventureSceneRevision from '@/models/web-adventure-scene-revision';

const params = Promise.resolve({ id: 'kael_infirmary' });

function makeRequest(): NextRequest {
  return new Request(
    'http://localhost/api/web-adventure/scenes/kael_infirmary/revisions',
  ) as unknown as NextRequest;
}

describe('GET /api/web-adventure/scenes/[id]/revisions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('빈 목록 — revision 0 개', async () => {
    (WebAdventureSceneRevision.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
      }),
    });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('version DESC 정렬된 목록 반환 — snapshot 미포함', async () => {
    const list = [
      { _id: 'r3', version: 3, createdAt: new Date(), author: 'system' },
      { _id: 'r2', version: 2, createdAt: new Date(), author: 'system' },
      { _id: 'r1', version: 1, createdAt: new Date(), author: 'system' },
    ];
    (WebAdventureSceneRevision.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(list) }),
      }),
    });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.data[0].version).toBe(3);
    // snapshot 키가 없는지 확인.
    expect(body.data[0].snapshot).toBeUndefined();
  });
});
