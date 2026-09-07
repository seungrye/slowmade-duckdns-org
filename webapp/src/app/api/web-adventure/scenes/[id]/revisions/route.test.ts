// /api/web-adventure/scenes/[id]/revisions - list GET tests.
//
// The snapshot is *excluded* (keeping it light). Only the minimum fields for the list (_id, version, createdAt, author).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// #177 - revisions became author-only. Authorisation is swapped for a mock (next-auth is not exercised).
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/web-adventure-scene-revision', () => ({
  default: { find: vi.fn() },
}));

import { GET } from './route';
import WebAdventureSceneRevision from '@/models/web-adventure-scene-revision';
import { requireOwner } from '@/lib/require-owner';

const params = Promise.resolve({ id: 'kael_infirmary' });

function makeRequest(): NextRequest {
  return new Request(
    'http://localhost/api/web-adventure/scenes/kael_infirmary/revisions',
  ) as unknown as NextRequest;
}

describe('GET /api/web-adventure/scenes/[id]/revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The author by default - only the individual cases below switch to a non-author.
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@x.test' });
  });

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
    // Confirms there is no snapshot key.
    expect(body.data[0].snapshot).toBeUndefined();
  });

  // #177 - a penetration test found this route returning 200 unauthenticated. A revision is the authoring tool's metadata.
  it('작성자가 아니면 404 — 씬 존재 여부도 알려주지 않는다', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
    expect(WebAdventureSceneRevision.find).not.toHaveBeenCalled();
  });
});
