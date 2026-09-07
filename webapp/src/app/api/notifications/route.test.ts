// The notifications API (#237).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const mockRequireAuth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/require-auth', () => ({ requireAuth: mockRequireAuth }));

const mockList = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications', () => ({ listNotifications: mockList }));

const mockUpdateOne = vi.hoisted(() => vi.fn());
const mockUserFindOne = vi.hoisted(() => vi.fn());
vi.mock('@/models/user', () => ({
  default: { updateOne: mockUpdateOne, findOne: mockUserFindOne },
}));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

import { GET } from './route';
import { POST } from './seen/route';
import { POST as READ } from './read/route';

describe('GET /api/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ email: 'me@x.test' });
    mockList.mockResolvedValue({ unreadCount: 3, items: [] });
  });

  it('비로그인은 401 — 목록을 만들지 않는다', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
    expect((await GET()).status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('로그인한 사람의 알림만 조회한다', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('me@x.test');
    expect((await res.json()).data.unreadCount).toBe(3);
  });
});

// This used to be called merely by opening the page. It is now a manual action triggered by **the [mark all read]
// button** (#247) - it raises the baseline and empties the per-item read list.
describe('POST /api/notifications/seen — 모두 읽음', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ email: 'me@x.test' });
    mockUpdateOne.mockResolvedValue({});
  });

  it('비로그인은 401 — 아무것도 바꾸지 않는다', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
    expect((await POST()).status).toBe(401);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('본인의 확인 시각만 갱신한다', async () => {
    expect((await POST()).status).toBe(200);
    const [filter, update] = mockUpdateOne.mock.calls[0];
    expect(filter).toEqual({ email: 'me@x.test' });
    expect((update.$set as { notificationsSeenAt: Date }).notificationsSeenAt).toBeInstanceOf(Date);
  });

  // Once the baseline rises to now, every per-item id older than it is meaningless.
  // Without clearing them, the list survives [mark all read] and only eats into the cap.
  it('개별 읽음 목록을 함께 비운다', async () => {
    await POST();
    const [, update] = mockUpdateOne.mock.calls[0];
    expect((update.$set as { notificationsReadIds: string[] }).notificationsReadIds).toEqual([]);
  });
});

describe('POST /api/notifications/read — 이것만 읽음', () => {
  const req = (body: unknown) =>
    ({ json: async () => body }) as unknown as Request;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ email: 'me@x.test' });
    mockUpdateOne.mockResolvedValue({});
    mockUserFindOne.mockReturnValue({
      select: () => ({ lean: async () => ({ notificationsReadIds: ['old'] }) }),
    });
  });

  it('비로그인은 401 — 아무것도 바꾸지 않는다', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({}, { status: 401 }));
    expect((await READ(req({ id: 'c1' }))).status).toBe(401);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('누른 덧글 id 를 본인 목록에 더한다', async () => {
    expect((await READ(req({ id: 'c1' }))).status).toBe(200);
    const [filter, update] = mockUpdateOne.mock.calls[0];
    expect(filter).toEqual({ email: 'me@x.test' });
    expect((update.$set as { notificationsReadIds: string[] }).notificationsReadIds)
      .toEqual(['old', 'c1']);
  });

  it('같은 것을 두 번 눌러도 목록이 늘지 않는다', async () => {
    await READ(req({ id: 'old' }));
    const [, update] = mockUpdateOne.mock.calls[0];
    expect((update.$set as { notificationsReadIds: string[] }).notificationsReadIds).toEqual(['old']);
  });

  // Someone else's notifications cannot be touched - ids go only into one's own document, so it is blocked structurally.
  it('id 가 없으면 400 — 아무것도 바꾸지 않는다', async () => {
    expect((await READ(req({}))).status).toBe(400);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('본문이 깨져 있어도 500 이 아니라 400', async () => {
    const bad = { json: async () => { throw new Error('bad json'); } } as unknown as Request;
    expect((await READ(bad)).status).toBe(400);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });
});
