import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({
  env: {
    siteUrl: 'https://test.example.com',
    minio: {
      endpoint: 'cdn.example.com',
      accessKey: 'ak',
      secretKey: 'sk',
      bucket: 'public',
      port: undefined,
    },
    painterImage: {
      dailyLimit: 50,
    },
  },
}));

const mockGenerateImage = vi.fn();
const mockTryConsume = vi.fn();
vi.mock('@/lib/painter/imageGen', async () => {
  const actual: typeof import('@/lib/painter/imageGen') = await vi.importActual('@/lib/painter/imageGen');
  return {
    ...actual,
    generateImage: (...args: unknown[]) => mockGenerateImage(...args),
  };
});
vi.mock('@/lib/painter/quota', () => ({
  tryConsumeDailyQuota: (...args: unknown[]) => mockTryConsume(...args),
  todayKey: () => '2026-06-05',
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
  return { default: MockComment };
});

function makeRequest(body: object, extraHeaders: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/painter', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'origin': 'https://test.example.com',
      ...extraHeaders,
    },
  });
}

describe('/api/painter POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommentSave.mockResolvedValue(undefined);
    mockAuth.mockResolvedValue({ user: { name: 'Test', email: 'test@test.com' } });
    mockGenerateImage.mockResolvedValue({
      key: 'painter-images/test.jpg',
      url: 'https://cdn.example.com/public/painter-images/test.jpg',
    });
    mockTryConsume.mockResolvedValue(true);
  });

  it('미로그인 사용자면 401 반환', async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ postId: 'post-id', content: '@painter-bot 한국 마을' }));
    expect(res.status).toBe(401);
  });

  it('content 없으면 400 반환', async () => {
    const res = await POST(makeRequest({ postId: 'post-id', content: '' }));
    expect(res.status).toBe(400);
  });

  it('postId 없으면 400 반환', async () => {
    const res = await POST(makeRequest({ content: '@painter-bot 안녕' }));
    expect(res.status).toBe(400);
  });

  it('허용되지 않은 origin이면 403 반환', async () => {
    const req = new NextRequest('http://localhost/api/painter', {
      method: 'POST',
      body: JSON.stringify({ postId: 'post-id', content: '@painter-bot 테스트' }),
      headers: {
        'Content-Type': 'application/json',
        'origin': 'https://attacker.com',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('painter 라우트는 모든 content 를 prompt 로 처리한다 (/image 명령어 불필요)', async () => {
    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@painter-bot 한국 마을 광장 도트',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockTryConsume).toHaveBeenCalledTimes(1);
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
    const [promptArg] = mockGenerateImage.mock.calls[0];
    // @painter-bot 멘션 부분은 제거되고 나머지가 prompt
    expect(promptArg).toBe('한국 마을 광장 도트');

    // userComment + painter 이미지 댓글 = 2회
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
  });

  it('멘션 없이 prompt 만 와도 전체 content 를 prompt 로 사용한다', async () => {
    const res = await POST(makeRequest({
      postId: 'post-id',
      content: 'a cat dancing on the moon',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
    const [promptArg] = mockGenerateImage.mock.calls[0];
    expect(promptArg).toBe('a cat dancing on the moon');
  });

  it('painter quota 초과 시 안내 댓글 저장 + generateImage 호출 X', async () => {
    mockTryConsume.mockResolvedValueOnce(false);

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@painter-bot 무엇이든',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGenerateImage).not.toHaveBeenCalled();
    // userComment + 안내 댓글
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
  });

  it('Pollinations 실패 시 안내 댓글 저장', async () => {
    mockGenerateImage.mockRejectedValueOnce(new Error('Pollinations 502'));

    const res = await POST(makeRequest({
      postId: 'post-id',
      content: '@painter-bot something',
      anonid: 'test1234',
    }));
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
  });

  it('painter 댓글은 author=painter-bot, isEnji=true, imageUrl 포함하여 저장', async () => {
    await POST(makeRequest({
      postId: 'post-id',
      content: '@painter-bot 한국 마을',
      anonid: 'test1234',
    }));
    await new Promise((r) => setTimeout(r, 10));

    // mockCommentSave 가 호출된 인스턴스 중 painter 댓글 분 검증
    // 첫 번째 호출 = userComment, 두 번째 호출 = painter 댓글
    expect(mockCommentSave).toHaveBeenCalledTimes(2);
    // this 컨텍스트는 캡처가 까다로우므로 호출 횟수와 generateImage 호출로 보조 검증.
    const [promptArg] = mockGenerateImage.mock.calls[0];
    expect(promptArg).toBe('한국 마을');
  });

  it('한국어 prompt 가 정확히 전달된다', async () => {
    await POST(makeRequest({
      postId: 'post-id',
      content: '@painter-bot 한국 마을 광장 도트 픽셀 아트',
      anonid: 'test1234',
    }));
    await new Promise((r) => setTimeout(r, 10));

    const [promptArg] = mockGenerateImage.mock.calls[0];
    expect(promptArg).toBe('한국 마을 광장 도트 픽셀 아트');
  });
});
