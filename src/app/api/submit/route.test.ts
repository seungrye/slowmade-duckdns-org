import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { points: { newPost: 5 } } }));
vi.mock('@/models/post', () => ({ default: { create: vi.fn(), findById: vi.fn() } }));
vi.mock('@/models/user', () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock('@/models/post-revision', () => ({ default: { create: vi.fn() } }));
vi.mock('@/lib/achievements', () => ({ checkAndGrantPostCountAchievements: vi.fn().mockResolvedValue([]) }));

import { POST } from './route';
import { auth } from '@/auth';
import Post from '@/models/post';
import PostRevision from '@/models/post-revision';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

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
    (Post.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest({ userEmail: 'a@test.com', title: 'T', jsonContent: '{}' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pointsGained).toBe(5);
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
