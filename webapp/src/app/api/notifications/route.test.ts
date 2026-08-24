// 알림 API (#237).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const mockRequireAuth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/require-auth', () => ({ requireAuth: mockRequireAuth }));

const mockList = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications', () => ({ listNotifications: mockList }));

const mockUpdateOne = vi.hoisted(() => vi.fn());
vi.mock('@/models/user', () => ({ default: { updateOne: mockUpdateOne } }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

import { GET } from './route';
import { POST } from './seen/route';

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

describe('POST /api/notifications/seen', () => {
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
});
