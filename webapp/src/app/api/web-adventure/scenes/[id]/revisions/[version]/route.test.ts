// /api/web-adventure/scenes/[id]/revisions/[version] — 단일 GET 테스트.
// snapshot 포함 (미리보기 용).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/web-adventure-scene-revision', () => ({
  default: { findOne: vi.fn() },
}));

import { GET } from './route';
import WebAdventureSceneRevision from '@/models/web-adventure-scene-revision';

function makeRequest(): NextRequest {
  return new Request(
    'http://localhost/api/web-adventure/scenes/kael_infirmary/revisions/2',
  ) as unknown as NextRequest;
}

describe('GET /api/web-adventure/scenes/[id]/revisions/[version]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (WebAdventureSceneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: 'kael_infirmary', version: '99' }),
    });
    expect(res.status).toBe(404);
  });

  it('찾으면 200 + snapshot 포함', async () => {
    const rev = {
      _id: 'r2',
      sceneId: 'kael_infirmary',
      version: 2,
      snapshot: { id: 'kael_infirmary', title: '옛 제목', body: ['x'] },
      createdAt: new Date(),
      author: 'system',
    };
    (WebAdventureSceneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(rev),
    });
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: 'kael_infirmary', version: '2' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.version).toBe(2);
    expect(body.data.snapshot.title).toBe('옛 제목');
  });

  it('version 이 숫자가 아니면 400', async () => {
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: 'kael_infirmary', version: 'abc' }),
    });
    expect(res.status).toBe(400);
  });
});
