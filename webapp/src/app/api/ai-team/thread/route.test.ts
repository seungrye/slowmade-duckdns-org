// AI 팀 요청 스레드 상세 (#207).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockEnv = vi.hoisted(() => ({ aiTeamKey: '', ownerEmail: '' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockPostFindOne = vi.hoisted(() => vi.fn());
vi.mock('@/models/post', () => ({ default: { findOne: mockPostFindOne } }));

const mockCommentFind = vi.hoisted(() => vi.fn());
vi.mock('@/models/comment', () => ({ default: { find: mockCommentFind } }));

import { GET } from './route';

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.select = vi.fn(() => c);
  c.sort = vi.fn(() => c);
  c.limit = vi.fn(() => c);
  c.lean = vi.fn(async () => result);
  return c;
}

const OID = '507f1f77bcf86cd799439011';

// 키를 아예 안 보내려면 null 을 준다 — undefined 는 기본 매개변수를 되살린다.
function req(postId?: string, key: string | null = 'secret-key') {
  const url = postId === undefined
    ? 'http://localhost/api/ai-team/thread'
    : `http://localhost/api/ai-team/thread?postId=${postId}`;
  return new NextRequest(url, { headers: key === null ? {} : { 'x-ai-team-key': key } });
}

const POST_DOC = {
  _id: OID,
  title: '검색 기능 붙여줘',
  htmlContent: '<p>태그 말고 <b>제목</b>으로도 찾고 싶다</p>',
  tags: ['ai-req'],
  userEmail: 'owner@x.test',
  isPrivate: true,
  isDeleted: false,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

describe('GET /api/ai-team/thread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.aiTeamKey = 'secret-key';
    mockEnv.ownerEmail = 'owner@x.test';
    mockPostFindOne.mockReturnValue(chain(POST_DOC));
    mockCommentFind.mockReturnValue(chain([
      { _id: 'c1', author: 'owner', content: '이렇게 해줘', parent: null, createdAt: '2026-08-20T01:00:00.000Z', isEnji: false },
      { _id: 'c2', author: 'claude', content: '스펙 초안입니다', parent: 'c1', createdAt: '2026-08-20T02:00:00.000Z', isEnji: true },
    ]));
  });

  it('키가 없으면 404 — DB 에 닿지도 않는다', async () => {
    const res = await GET(req(OID, null));
    expect(res.status).toBe(404);
    expect(mockPostFindOne).not.toHaveBeenCalled();
  });

  it('postId 가 없으면 400', async () => {
    expect((await GET(req())).status).toBe(400);
  });

  // mongoose 가 CastError 를 던져 500 이 되지 않게, DB 에 닿기 전에 거른다.
  it('postId 형식이 틀리면 400 — DB 에 닿지 않는다', async () => {
    const res = await GET(req('not-an-objectid'));
    expect(res.status).toBe(400);
    expect(mockPostFindOne).not.toHaveBeenCalled();
  });

  it('요청 글이 아니면 404', async () => {
    mockPostFindOne.mockReturnValue(chain(null));
    expect((await GET(req(OID))).status).toBe(404);
  });

  // 필터를 통과해 왔더라도 문서 자체를 한 번 더 본다(방어 이중화).
  it('필터를 통과해도 문서가 조건에 안 맞으면 404', async () => {
    mockPostFindOne.mockReturnValue(chain({ ...POST_DOC, isPrivate: false }));
    expect((await GET(req(OID))).status).toBe(404);
  });

  it('정상이면 본문과 덧글을 돌려준다', async () => {
    const res = await GET(req(OID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.postId).toBe(OID);
    expect(json.data.title).toBe('검색 기능 붙여줘');
    expect(json.data.comments).toHaveLength(2);
    expect(json.data.comments[1]).toMatchObject({ author: 'claude', isBot: true });
  });

  it('본문은 태그를 벗긴 평문으로 준다 — AI 가 읽을 것이다', async () => {
    const json = await (await GET(req(OID))).json();
    expect(json.data.body).toBe('태그 말고 제목 으로도 찾고 싶다');
    expect(json.data.body).not.toContain('<');
  });

  it('주인 이메일은 응답에 싣지 않는다', async () => {
    const json = await (await GET(req(OID))).json();
    expect(JSON.stringify(json)).not.toContain('owner@x.test');
  });
});
