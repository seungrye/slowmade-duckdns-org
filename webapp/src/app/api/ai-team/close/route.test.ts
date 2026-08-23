// AI 팀 스레드 닫기 (#222).
//
// #213 에서는 "닫는 주체는 사람"이라고 못박았다. 주인이 그 권한을 AI 에 위임하기로 정해
// 이 라우트가 생겼다. 그래서 **닫기 외에는 아무것도 못 하게** 막는 것이 이 파일의 일이다:
// 태그 배열을 통째로 받으면 이 통로로 `ai-req` 를 뗄 수 있고, 그러면 그 글이 요청이었다는
// 기록이 사라진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockEnv = vi.hoisted(() => ({ aiTeamKey: '', ownerEmail: '' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockPostFindOne = vi.hoisted(() => vi.fn());
const mockPostUpdate = vi.hoisted(() => vi.fn());
vi.mock('@/models/post', () => ({
  default: { findOne: mockPostFindOne, findByIdAndUpdate: mockPostUpdate },
}));

import { POST } from './route';

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.lean = vi.fn(async () => result);
  return c;
}

const OID = '507f1f77bcf86cd799439011';
const OPEN = { _id: OID, userEmail: 'owner@x.test', isPrivate: true, isDeleted: false, tags: ['ai-req'] };

function req(body: object, key: string | null = 'secret-key') {
  return new NextRequest('http://localhost/api/ai-team/close', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(key === null ? {} : { 'x-ai-team-key': key }),
    },
  });
}

describe('POST /api/ai-team/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.aiTeamKey = 'secret-key';
    mockEnv.ownerEmail = 'owner@x.test';
    mockPostFindOne.mockReturnValue(chain(OPEN));
    mockPostUpdate.mockResolvedValue({});
  });

  it('키가 없으면 404 — 아무것도 바꾸지 않는다', async () => {
    expect((await POST(req({ postId: OID }, null))).status).toBe(404);
    expect(mockPostUpdate).not.toHaveBeenCalled();
  });

  it('키가 틀리면 404', async () => {
    expect((await POST(req({ postId: OID }, 'wrong'))).status).toBe(404);
    expect(mockPostUpdate).not.toHaveBeenCalled();
  });

  it('postId 형식이 틀리면 400 — DB 에 닿지 않는다', async () => {
    expect((await POST(req({ postId: 'nope' }))).status).toBe(400);
    expect(mockPostFindOne).not.toHaveBeenCalled();
  });

  it('요청 스레드가 아니면 404', async () => {
    mockPostFindOne.mockReturnValue(chain(null));
    expect((await POST(req({ postId: OID }))).status).toBe(404);
    expect(mockPostUpdate).not.toHaveBeenCalled();
  });

  // 필터를 통과해 왔더라도 문서를 한 번 더 본다(방어 이중화).
  it('이미 닫힌 글은 404 — 더는 AI 팀 스레드가 아니다', async () => {
    mockPostFindOne.mockReturnValue(chain({ ...OPEN, tags: ['ai-req', 'ai-done'] }));
    expect((await POST(req({ postId: OID }))).status).toBe(404);
    expect(mockPostUpdate).not.toHaveBeenCalled();
  });

  it('남의 글이면 404', async () => {
    mockPostFindOne.mockReturnValue(chain({ ...OPEN, userEmail: 'someone-else@x.test' }));
    expect((await POST(req({ postId: OID }))).status).toBe(404);
    expect(mockPostUpdate).not.toHaveBeenCalled();
  });

  it('정상이면 200', async () => {
    expect((await POST(req({ postId: OID }))).status).toBe(200);
    expect(mockPostUpdate).toHaveBeenCalledTimes(1);
  });

  // 여기가 이 라우트의 핵심이다.
  it('ai-done 을 더하기만 한다 — 태그 배열을 갈아치우지 않는다', async () => {
    await POST(req({ postId: OID }));
    const [id, update] = mockPostUpdate.mock.calls[0];
    expect(id).toBe(OID);
    expect(update).toEqual({ $addToSet: { tags: 'ai-done' } });
    // $set 으로 tags 를 통째로 넘기면 ai-req 가 사라질 수 있다.
    expect(update.$set).toBeUndefined();
  });

  it('주인 글의 updatedAt 을 건드리지 않는다 — 봇이 태그 붙였다고 수정됨으로 보이면 안 된다', async () => {
    await POST(req({ postId: OID }));
    const opts = mockPostUpdate.mock.calls[0][2];
    expect(opts).toMatchObject({ timestamps: false });
  });

  // 호출자가 태그를 실어 보내도 무시해야 한다 — 그게 통하면 ai-req 를 뗄 수 있다.
  it('본문에 tags 를 실어 보내도 무시한다', async () => {
    await POST(req({ postId: OID, tags: [] }));
    const [, update] = mockPostUpdate.mock.calls[0];
    expect(update).toEqual({ $addToSet: { tags: 'ai-done' } });
  });
});
