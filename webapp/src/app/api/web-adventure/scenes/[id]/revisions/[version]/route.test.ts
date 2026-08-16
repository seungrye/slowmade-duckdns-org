// /api/web-adventure/scenes/[id]/revisions/[version] — 단일 GET 테스트.
// snapshot 포함 (미리보기 용).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// #177 — 리비전은 작성자 전용이 됐다. 인가는 목으로 갈아 끼운다(next-auth 를 안 태운다).
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/web-adventure-scene-revision', () => ({
  default: { findOne: vi.fn() },
}));

import { GET } from './route';
import WebAdventureSceneRevision from '@/models/web-adventure-scene-revision';
import { requireOwner } from '@/lib/require-owner';

function makeRequest(): NextRequest {
  return new Request(
    'http://localhost/api/web-adventure/scenes/kael_infirmary/revisions/2',
  ) as unknown as NextRequest;
}

describe('GET /api/web-adventure/scenes/[id]/revisions/[version]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본은 작성자 — 아래 개별 케이스에서만 비작성자로 바꾼다.
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@x.test' });
  });

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

  // #177 — 스냅샷은 씬 전문이라 더 민감하다.
  it('작성자가 아니면 404 — 스냅샷을 조회조차 하지 않는다', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'kael_infirmary', version: '0' }) });
    expect(res.status).toBe(404);
  });
});
