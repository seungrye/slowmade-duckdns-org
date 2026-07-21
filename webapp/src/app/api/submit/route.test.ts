import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { points: { newPost: 5 } } }));
vi.mock('@/models/post', () => ({ default: { create: vi.fn(), findById: vi.fn() } }));
vi.mock('@/models/user', () => ({ default: { findOneAndUpdate: vi.fn(), findOne: vi.fn() } }));
vi.mock('@/models/post-revision', () => ({ default: { create: vi.fn() } }));
vi.mock('@/lib/achievements', () => ({ checkAndGrantPostCountAchievements: vi.fn().mockResolvedValue([]) }));

import { POST } from './route';
import { auth } from '@/auth';
import Post from '@/models/post';
import User from '@/models/user';
import PostRevision from '@/models/post-revision';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
// 새 글 작성 경로가 참조하는 User.findOne(...).lean() 기본 목(작성자명 조회).
const stubAuthorUser = (username = '진짜닉') =>
  asMock(User.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ username }) });

function makeRequest(body: object) {
  return new Request('http://localhost/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/submit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('인증되지 않으면 401을 반환한다', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ userEmail: 'a@b.com', title: 'T', jsonContent: '{}' }));
    expect(res.status).toBe(401);
  });

  it('세션 이메일과 payload 이메일이 다르면 403을 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'real@test.com' } });
    const res = await POST(makeRequest({ userEmail: 'other@test.com', title: 'T', jsonContent: '{}' }));
    expect(res.status).toBe(403);
  });

  it('title이 없으면 400을 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    const res = await POST(makeRequest({ userEmail: 'a@test.com', jsonContent: '{}' }));
    expect(res.status).toBe(400);
  });

  it('jsonContent가 없으면 400을 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    const res = await POST(makeRequest({ userEmail: 'a@test.com', title: 'T' }));
    expect(res.status).toBe(400);
  });

  it('새 게시글 작성 시 201을 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    stubAuthorUser();
    (Post.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest({ userEmail: 'a@test.com', title: 'T', htmlContent: '<p>x</p>', jsonContent: '{}' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pointsGained).toBe(5);
  });

  it('새 글 작성 시 author/userEmail 은 서버가 강제하고 likes/views/isDeleted 는 무시한다 (Mass Assignment 방지)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    stubAuthorUser('진짜닉');
    asMock(Post.create).mockResolvedValue({});
    await POST(makeRequest({
      userEmail: 'a@test.com', title: 'T', htmlContent: '<p>x</p>', jsonContent: '{}',
      author: '관리자', likes: 999, views: 999, isDeleted: true, version: 42,
    }));
    const arg = asMock(Post.create).mock.calls[0][0];
    expect(arg.author).toBe('진짜닉');        // 클라 '관리자' 위조 무시 → 서버 username
    expect(arg.userEmail).toBe('a@test.com'); // 세션 강제
    expect(arg.likes).toBeUndefined();         // 클라 값 미전달(스키마 기본 0)
    expect(arg.views).toBeUndefined();
    expect(arg.isDeleted).toBeUndefined();
    expect(arg.version).toBeUndefined();
  });

  it('_id가 있으면 게시글 수정 분기로 진입한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    const mockPost = {
      userEmail: 'a@test.com',
      toObject: () => ({ title: 'old', jsonContent: '{}', updatedAt: new Date() }),
      set: vi.fn(),
      save: vi.fn(),
      version: 1,
      updatedAt: new Date(),
    };
    (Post.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockPost);
    (PostRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest({ _id: 'post1', userEmail: 'a@test.com', title: 'T', jsonContent: '{}' }));
    expect(res.status).toBe(201);
    expect(Post.findById).toHaveBeenCalledWith('post1');
    expect(mockPost.save).toHaveBeenCalled();
  });

  it('수정 시 게시글을 찾지 못하면 404를 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    (Post.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest({ _id: 'missing', userEmail: 'a@test.com', title: 'T', jsonContent: '{}' }));
    expect(res.status).toBe(404);
  });

  it('수정 시 소유자가 아니면 403을 반환한다 (IDOR)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'attacker@test.com' } });
    const mockPost = { userEmail: 'victim@test.com', toObject: vi.fn(), set: vi.fn(), save: vi.fn(), version: 1 };
    (Post.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockPost);
    const res = await POST(makeRequest({ _id: 'post1', userEmail: 'attacker@test.com', title: 'T', jsonContent: '{}' }));
    expect(res.status).toBe(403);
    expect(mockPost.save).not.toHaveBeenCalled();
  });

  it('htmlContent가 2MB를 초과하면 413을 반환한다 (M-3)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    const res = await POST(makeRequest({ userEmail: 'a@test.com', title: 'T', jsonContent: '{}', htmlContent: oversized }));
    expect(res.status).toBe(413);
  });

  it('jsonContent가 2MB를 초과하면 413을 반환한다 (M-3)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    const oversized = { data: 'x'.repeat(2 * 1024 * 1024 + 1) };
    const res = await POST(makeRequest({ userEmail: 'a@test.com', title: 'T', jsonContent: oversized }));
    expect(res.status).toBe(413);
  });

  it('수정 시 허용된 필드만 set에 전달된다 (Mass Assignment 방지)', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    const mockPost = {
      userEmail: 'a@test.com',
      toObject: () => ({ title: 'old', jsonContent: '{}', updatedAt: new Date() }),
      set: vi.fn(),
      save: vi.fn(),
      version: 1,
      updatedAt: new Date(),
    };
    (Post.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockPost);
    (PostRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await POST(makeRequest({ _id: 'post1', userEmail: 'a@test.com', title: '새 제목', htmlContent: '<p>내용</p>', jsonContent: '{}', tags: ['tag1'], version: 999 }));
    expect(mockPost.set).toHaveBeenCalledWith({ title: '새 제목', htmlContent: '<p>내용</p>', jsonContent: '{}', tags: ['tag1'] });
    expect(mockPost.set).not.toHaveBeenCalledWith(expect.objectContaining({ version: 999 }));
  });
});
