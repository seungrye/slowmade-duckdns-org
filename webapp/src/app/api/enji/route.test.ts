import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({
  env: {
    geminiApiKey: 'test-key',
    points: { newComment: 1 },
  },
}));

const mockCommentSave = vi.fn();

vi.mock('@/models/post', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'post-id',
        title: '테스트 게시글',
        htmlContent: '<p>내용</p>',
      }),
    }),
  },
}));

vi.mock('@/models/user', () => ({
  default: { findOne: vi.fn().mockResolvedValue(null) },
}));

vi.mock('@/models/comment', () => {
  function MockComment(this: Record<string, unknown>, data: Record<string, unknown>) {
    Object.assign(this, data);
    this._id = 'comment-id';
    this.save = mockCommentSave;
  }
  MockComment.find = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  });
  return { default: MockComment };
});

const mockGenerateContent = vi.fn().mockResolvedValue({
  text: 'enji의 테스트 응답입니다.',
});

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent };
  }
  return { GoogleGenAI: MockGoogleGenAI };
});

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/enji', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/api/enji POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommentSave.mockResolvedValue(undefined);
  });

  it('content 없으면 400 반환', async () => {
    const res = await POST(makeRequest({ postId: 'post-id', content: '' }));
    expect(res.status).toBe(400);
  });

  it('postId 없으면 400 반환', async () => {
    const res = await POST(makeRequest({ content: '@enji 안녕' }));
    expect(res.status).toBe(400);
  });

  it('@enji 댓글과 enji 응답 댓글을 모두 저장하고 201 반환', async () => {
    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji 이 글 요약해줘',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.enjiComment).toBeTruthy();
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
  });

  it('Gemini API 실패 시 사용자 댓글은 저장되고 enjiComment는 null', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API error'));

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji 테스트',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.enjiComment).toBeNull();
    expect(mockCommentSave).toHaveBeenCalledTimes(1);
  });

  it('429 쿼터 초과 시 enjiSleeping: true 반환', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('[429] quota exceeded'));

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji 테스트',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.enjiSleeping).toBe(true);
    expect(json.data.enjiComment).toBeNull();
  });
});
