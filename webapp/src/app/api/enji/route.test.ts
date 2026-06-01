import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({
  env: {
    geminiApiKey: 'test-key',
    siteUrl: 'https://test.example.com',
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

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent };
  }
  return { GoogleGenAI: MockGoogleGenAI };
});

function makeRequest(body: object, extraHeaders: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/enji', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'origin': 'https://test.example.com',
      ...extraHeaders,
    },
  });
}

describe('/api/enji POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommentSave.mockResolvedValue(undefined);
    mockGenerateContent.mockResolvedValue({ text: 'enji 테스트 응답' });
    mockAuth.mockResolvedValue({ user: { name: 'Test', email: 'test@test.com' } });
  });

  it('미로그인 사용자면 401 반환', async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ postId: 'post-id', content: '@enji-bot 테스트' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toMatch(/로그인/);
  });

  it('content 없으면 400 반환', async () => {
    const res = await POST(makeRequest({ postId: 'post-id', content: '' }));
    expect(res.status).toBe(400);
  });

  it('postId 없으면 400 반환', async () => {
    const res = await POST(makeRequest({ content: '@enji-bot 안녕' }));
    expect(res.status).toBe(400);
  });

  it('허용되지 않은 origin이면 403 반환', async () => {
    const req = new NextRequest('http://localhost/api/enji', {
      method: 'POST',
      body: JSON.stringify({ postId: 'post-id', content: '@enji-bot 테스트' }),
      headers: {
        'Content-Type': 'application/json',
        'origin': 'https://attacker.com',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('사용자 댓글을 저장하고 즉시 201 반환', async () => {
    mockGenerateContent.mockReturnValueOnce(new Promise(() => {})); // Gemini가 늦어도

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji-bot 이 글 요약해줘',
      anonid: 'test1234',
    }));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.userComment).toBeTruthy();
    expect(mockCommentSave).toHaveBeenCalledTimes(1); // userComment만 즉시 저장
  });

  it('Gemini 응답이 오면 백그라운드에서 enji 댓글 저장', async () => {
    let resolveGemini!: (v: { text: string }) => void;
    mockGenerateContent.mockReturnValueOnce(
      new Promise<{ text: string }>((resolve) => { resolveGemini = resolve; })
    );

    const resPromise = POST(makeRequest({
      postId: 'post-id',
      content: '@enji-bot 테스트',
      anonid: 'test1234',
    }));

    const res = await resPromise;
    expect(res.status).toBe(201);
    expect(mockCommentSave).toHaveBeenCalledTimes(1); // 아직 userComment만

    resolveGemini({ text: 'enji 응답' });
    await new Promise((r) => setTimeout(r, 10)); // 백그라운드 처리 대기

    expect(mockCommentSave).toHaveBeenCalledTimes(2); // enji 댓글도 저장됨
  });

  it('첫 모델이 503 으로 실패하면 fallback 모델로 재시도하여 성공한다', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('{"error":{"code":503,"status":"UNAVAILABLE","message":"high demand"}}'))
      .mockResolvedValueOnce({ text: 'fallback 모델 응답' });

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji-bot 테스트',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockCommentSave).toHaveBeenCalledTimes(2); // userComment + enji 응답
  });

  it('모든 모델이 transient 에러로 실패하면 안내용 enji 댓글을 저장한다', async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('{"error":{"code":503,"status":"UNAVAILABLE","message":"high demand"}}'),
    );

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji-bot 테스트',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    // 4개 모델 전부 시도
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
    // userComment + 안내 댓글
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
  });

  it('비-transient 에러는 fallback 없이 즉시 안내 댓글로 종료한다', async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"bad input"}}'),
    );

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji-bot 테스트',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    // 첫 모델에서 즉시 중단
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    // userComment + 안내 댓글
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
  });

  it('빈 응답이면 다음 모델로 fallback 한다', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({ text: '' })
      .mockResolvedValueOnce({ text: '두번째 모델 응답' });

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@enji-bot 테스트',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
  });
});
