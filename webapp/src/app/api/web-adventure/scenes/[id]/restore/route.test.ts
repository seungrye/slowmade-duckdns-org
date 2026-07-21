// /api/web-adventure/scenes/[id]/restore — POST { version } 테스트.
//
// 동작:
//   - 그 version 의 snapshot 으로 *현재 씬 덮어쓰기*.
//   - 덮어쓰기 직전 *현재* 상태를 새 revision 으로 백업 (PUT 패턴 동일).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-scene', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));
vi.mock('@/models/web-adventure-scene-revision', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { POST } from './route';
import { auth } from '@/auth';
import WebAdventureScene from '@/models/web-adventure-scene';
import WebAdventureSceneRevision from '@/models/web-adventure-scene-revision';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ id: 'kael_infirmary' });

function makeRequest(body: object): NextRequest {
  return new Request(
    'http://localhost/api/web-adventure/scenes/kael_infirmary/restore',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  ) as unknown as NextRequest;
}

describe('POST /api/web-adventure/scenes/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(auth).mockResolvedValue({ user: { email: 'owner@test' } });
  });

  it('로그인하지 않으면 401 (무인증 복원 차단)', async () => {
    asMock(auth).mockResolvedValue(null);
    const res = await POST(makeRequest({ version: 0 }), { params });
    expect(res.status).toBe(401);
  });

  it('version 미지정 시 400', async () => {
    const res = await POST(makeRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it('해당 version revision 미발견 시 404', async () => {
    (WebAdventureSceneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await POST(makeRequest({ version: 99 }), { params });
    expect(res.status).toBe(404);
  });

  it('snapshot 으로 update ($set+$inc 한 번) + 새 commit revision 생성', async () => {
    const target = {
      sceneId: 'kael_infirmary',
      version: 2,
      snapshot: { id: 'kael_infirmary', title: '복원 대상', body: ['옛 본문'], choices: [] },
    };
    const currentScene = {
      id: 'kael_infirmary',
      title: '현재 제목',
      body: ['현재 본문'],
      choices: [],
      revisionCount: 6,
    };
    const restored = {
      id: 'kael_infirmary',
      title: '복원 대상',
      body: ['옛 본문'],
      choices: [],
      revisionCount: 7,
    };

    // findOne 두 곳을 mock — revision findOne + scene findOne.
    (WebAdventureSceneRevision.findOne as ReturnType<typeof vi.fn>)
      // 1) 복원 대상 revision 조회.
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(target),
      })
      // 2) 마지막 version 조회 (PUT 내부).
      .mockReturnValueOnce({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ version: 5 }),
        }),
      });
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(currentScene),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(restored),
    });

    const res = await POST(makeRequest({ version: 2 }), { params });
    expect(res.status).toBe(200);

    // findOneAndUpdate 1 번 — $set + $inc 합쳐 호출.
    const updateMock = WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>;
    expect(updateMock).toHaveBeenCalledOnce();
    const updateQuery = updateMock.mock.calls[0]![1] as {
      $set: Record<string, unknown>;
      $inc: { revisionCount: number };
    };
    expect(updateQuery.$set.title).toBe('복원 대상');
    expect(updateQuery.$inc.revisionCount).toBe(1);

    // revision create — 새 commit (snapshot = restored, version = restored.revisionCount).
    const createMock = WebAdventureSceneRevision.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledOnce();
    const created = createMock.mock.calls[0]![0] as {
      sceneId: string;
      snapshot: Record<string, unknown>;
      version: number;
    };
    expect(created.sceneId).toBe('kael_infirmary');
    expect(created.snapshot).toEqual(restored);
    expect(created.version).toBe(7);
  });
});
