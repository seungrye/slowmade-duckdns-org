// 덧글 알림 (#237).
//
// 내 글에 덧글이 달리거나 내 덧글에 답글이 달려도 알 방법이 없었다. AI 팀 스레드가 전부
// 덧글로 오가면서 실질적으로 걸렸다.
//
// **쓸 때 만들지 않고 읽을 때 계산한다** — 덧글 생성 경로가 넷이라(comments·enji·painter·
// ai-team) 거기에 알림 생성을 심으면 다섯 번째가 생길 때 조용히 빠진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockUserFindOne = vi.hoisted(() => vi.fn());
vi.mock('@/models/user', () => ({ default: { findOne: mockUserFindOne } }));

const mockPostFind = vi.hoisted(() => vi.fn());
vi.mock('@/models/post', () => ({ default: { find: mockPostFind } }));

const mockCommentFind = vi.hoisted(() => vi.fn());
const mockCommentCount = vi.hoisted(() => vi.fn());
vi.mock('@/models/comment', () => ({
  default: { find: mockCommentFind, countDocuments: mockCommentCount },
}));

import { notificationFilter, listNotifications } from './notifications';

const ME = new Types.ObjectId('507f1f77bcf86cd799439011');
const POST_A = new Types.ObjectId('507f1f77bcf86cd799439033');
const MY_COMMENT = new Types.ObjectId('507f1f77bcf86cd799439044');

describe('notificationFilter — 무엇이 내게 온 것인가', () => {
  const f = () => notificationFilter(ME, [POST_A], [MY_COMMENT]) as Record<string, unknown>;

  it('내 글의 덧글과 내 덧글의 답글을 함께 본다', () => {
    expect(f().$or).toEqual([
      { post: { $in: [POST_A] } },
      { parent: { $in: [MY_COMMENT] } },
    ]);
  });

  // 내가 쓴 덧글이 내 알림으로 오면 안 된다.
  // ($ne 는 null·필드없음까지 포함한다 — 실측 확인. 봇·익명 덧글은 그래서 걸린다.)
  it('내가 쓴 것은 제외한다', () => {
    expect(f().authorId).toEqual({ $ne: ME });
  });

  it('삭제된 덧글은 제외한다', () => {
    expect(f().isDeleted).toEqual({ $ne: true });
  });

  it('내 글도 내 덧글도 없으면 아무것도 걸리지 않는 형태', () => {
    const empty = notificationFilter(ME, [], []) as { $or: Array<Record<string, unknown>> };
    expect(empty.$or).toEqual([{ post: { $in: [] } }, { parent: { $in: [] } }]);
  });
});

/** mongoose 체인 목 */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.sort = vi.fn(() => c);
  c.limit = vi.fn(() => c);
  c.lean = vi.fn(async () => result);
  return c;
}

describe('listNotifications', () => {
  const SEEN = new Date('2026-08-24T00:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindOne.mockReturnValue(chain({ _id: ME, notificationsSeenAt: SEEN }));
    mockPostFind.mockReturnValue(chain([{ _id: POST_A, title: '내 글' }]));
    mockCommentCount.mockResolvedValue(1);
    mockCommentFind.mockReturnValue(chain([
      {
        _id: new Types.ObjectId('507f1f77bcf86cd799439055'),
        post: POST_A, parent: null, author: 'claude',
        content: '스펙 초안입니다.\n두 번째 줄', isEnji: true,
        createdAt: new Date('2026-08-24T01:00:00Z'),
      },
    ]));
  });

  it('사용자가 없으면 빈 결과', async () => {
    mockUserFindOne.mockReturnValue(chain(null));
    expect(await listNotifications('nobody@x.test')).toEqual({ unreadCount: 0, items: [] });
  });

  it('안 읽은 수와 항목을 함께 준다', async () => {
    const r = await listNotifications('me@x.test');
    expect(r.unreadCount).toBe(1);
    expect(r.items).toHaveLength(1);
  });

  it('글 제목과 발췌를 붙인다 — 줄바꿈은 한 줄로', async () => {
    const [item] = (await listNotifications('me@x.test')).items;
    expect(item.postTitle).toBe('내 글');
    expect(item.excerpt).toBe('스펙 초안입니다. 두 번째 줄');
  });

  // 이 기능의 주 용도가 AI 답글을 아는 것이다.
  it('봇 덧글을 봇으로 표시한다', async () => {
    const [item] = (await listNotifications('me@x.test')).items;
    expect(item.isBot).toBe(true);
    expect(item.author).toBe('claude');
  });

  it('seenAt 이후에 달린 것은 안 읽음으로 표시한다', async () => {
    const [item] = (await listNotifications('me@x.test')).items;
    expect(item.isUnread).toBe(true);
  });

  it('seenAt 이전 것은 읽음으로 표시한다', async () => {
    mockCommentFind.mockReturnValue(chain([{
      _id: new Types.ObjectId('507f1f77bcf86cd799439066'),
      post: POST_A, parent: null, author: '홍길동', content: '옛 덧글',
      createdAt: new Date('2026-08-23T00:00:00Z'),
    }]));
    const [item] = (await listNotifications('me@x.test')).items;
    expect(item.isUnread).toBe(false);
  });

  // 한 번도 안 봤으면 전부 새 것이다.
  it('seenAt 이 없으면 모두 안 읽음', async () => {
    mockUserFindOne.mockReturnValue(chain({ _id: ME }));
    const [item] = (await listNotifications('me@x.test')).items;
    expect(item.isUnread).toBe(true);
  });

  it('앵커로 뛸 수 있게 글id와 덧글id를 준다', async () => {
    const [item] = (await listNotifications('me@x.test')).items;
    expect(item.postId).toBe(String(POST_A));
    expect(item.id).toBe('507f1f77bcf86cd799439055');
  });
});
