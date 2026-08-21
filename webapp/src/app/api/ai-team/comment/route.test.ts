// AI 팀 덧글 쓰기 (#207).
//
// 이 라우트가 키 하나로 **글에 쓰기**를 허용한다. 그래서 대상 글이 요청 스레드인지
// 다시 확인하는 검사가 이 파일에서 가장 중요한 테스트다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockEnv = vi.hoisted(() => ({ aiTeamKey: '', ownerEmail: '' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockPostFindOne = vi.hoisted(() => vi.fn());
vi.mock('@/models/post', () => ({ default: { findOne: mockPostFindOne } }));

const mockCommentSave = vi.hoisted(() => vi.fn());
const mockCommentCtor = vi.hoisted(() => vi.fn());
vi.mock('@/models/comment', () => {
  function MockComment(this: Record<string, unknown>, data: Record<string, unknown>) {
    mockCommentCtor(data);
    Object.assign(this, data);
    this._id = 'new-comment-id';
    this.save = mockCommentSave;
  }
  return { default: MockComment };
});

import { POST } from './route';

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.lean = vi.fn(async () => result);
  return c;
}

const OID = '507f1f77bcf86cd799439011';

const POST_DOC = {
  _id: OID,
  userEmail: 'owner@x.test',
  isPrivate: true,
  isDeleted: false,
  tags: ['ai-req'],
};

// 키를 아예 안 보내려면 null 을 준다 — undefined 는 기본 매개변수를 되살린다.
function req(body: object, key: string | null = 'secret-key') {
  return new NextRequest('http://localhost/api/ai-team/comment', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(key === null ? {} : { 'x-ai-team-key': key }),
    },
  });
}

const OK = { postId: OID, persona: 'claude', content: '검수 결과: 통과' };

describe('POST /api/ai-team/comment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.aiTeamKey = 'secret-key';
    mockEnv.ownerEmail = 'owner@x.test';
    mockPostFindOne.mockReturnValue(chain(POST_DOC));
    mockCommentSave.mockResolvedValue(undefined);
  });

  it('키가 없으면 404 — 덧글을 만들지 않는다', async () => {
    const res = await POST(req(OK, null));
    expect(res.status).toBe(404);
    expect(mockCommentSave).not.toHaveBeenCalled();
  });

  it('키가 틀리면 404', async () => {
    expect((await POST(req(OK, 'wrong'))).status).toBe(404);
    expect(mockCommentSave).not.toHaveBeenCalled();
  });

  // 키가 새더라도 요청 스레드 밖으로는 못 나간다 — 이게 마지막 방어선이다.
  it('대상이 요청 스레드가 아니면 404 — 덧글을 만들지 않는다', async () => {
    mockPostFindOne.mockReturnValue(chain(null));
    const res = await POST(req(OK));
    expect(res.status).toBe(404);
    expect(mockCommentSave).not.toHaveBeenCalled();
  });

  it('필터를 통과해도 문서가 조건에 안 맞으면 404 (방어 이중화)', async () => {
    mockPostFindOne.mockReturnValue(chain({ ...POST_DOC, userEmail: 'someone-else@x.test' }));
    const res = await POST(req(OK));
    expect(res.status).toBe(404);
    expect(mockCommentSave).not.toHaveBeenCalled();
  });

  it('모르는 persona 는 400 — 아무 이름으로나 글을 쓸 수 없다', async () => {
    const res = await POST(req({ ...OK, persona: 'owner' }));
    expect(res.status).toBe(400);
    expect(mockCommentSave).not.toHaveBeenCalled();
  });

  it('내용이 비면 400', async () => {
    expect((await POST(req({ ...OK, content: '   ' }))).status).toBe(400);
  });

  it('내용이 5000자를 넘으면 413', async () => {
    const res = await POST(req({ ...OK, content: 'x'.repeat(5001) }));
    expect(res.status).toBe(413);
  });

  it('postId 형식이 틀리면 400 — DB 에 닿지 않는다', async () => {
    const res = await POST(req({ ...OK, postId: 'nope' }));
    expect(res.status).toBe(400);
    expect(mockPostFindOne).not.toHaveBeenCalled();
  });

  it('정상이면 201 과 덧글 id', async () => {
    const res = await POST(req(OK));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.commentId).toBe('new-comment-id');
    expect(mockCommentSave).toHaveBeenCalledTimes(1);
  });

  // 기존 봇 덧글 패턴을 그대로 쓴다 — comment-item.tsx 의 ✨ 스타일이 붙는다.
  it('덧글은 봇 모양으로 저장된다 — author=persona, authorId=null, isEnji', async () => {
    await POST(req(OK));
    expect(mockCommentCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        post: OID,
        content: '검수 결과: 통과',
        author: 'claude',
        authorId: null,
        isEnji: true,
      }),
    );
  });

  it('minimax 도 쓸 수 있다', async () => {
    const res = await POST(req({ ...OK, persona: 'minimax' }));
    expect(res.status).toBe(201);
    expect(mockCommentCtor).toHaveBeenCalledWith(expect.objectContaining({ author: 'minimax' }));
  });

  it('parentId 를 주면 답글로 달린다', async () => {
    await POST(req({ ...OK, parentId: 'c1' }));
    expect(mockCommentCtor).toHaveBeenCalledWith(expect.objectContaining({ parent: 'c1' }));
  });
});
