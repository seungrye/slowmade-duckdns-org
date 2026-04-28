import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { points: { deletePostCost: 10 } } }));
vi.mock('@/lib/posts', () => ({
  getPost: vi.fn(),
  deletePost: vi.fn(),
}));

import { GET, DELETE } from './route';
import { auth } from '@/auth';
import { getPost, deletePost } from '@/lib/posts';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

function makeGetRequest(id?: string) {
  const url = id
    ? `http://localhost/api/post?_id=${id}`
    : 'http://localhost/api/post';
  return new Request(url);
}

function makeDeleteRequest(body: object) {
  return new Request('http://localhost/api/post', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('GET /api/post', () => {
  beforeEach(() => vi.clearAllMocks());

  it('_id 없으면 400을 반환한다', async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it('게시글을 찾으면 200과 data를 반환한다', async () => {
    (getPost as ReturnType<typeof vi.fn>).mockResolvedValue({ post: { _id: 'p1', title: 'Test' } });
    const res = await GET(makeGetRequest('p1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe('Test');
  });

  it('게시글이 없으면 data가 null이다', async () => {
    (getPost as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(makeGetRequest('none'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });
});

describe('DELETE /api/post', () => {
  beforeEach(() => vi.clearAllMocks());

  it('인증되지 않으면 401을 반환한다', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest({ postId: 'p1' }));
    expect(res.status).toBe(401);
  });

  it('삭제 성공 시 200을 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    (deletePost as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, message: '삭제 완료' });
    const res = await DELETE(makeDeleteRequest({ postId: 'p1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('삭제 실패 시 400을 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'a@test.com' } });
    (deletePost as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, message: '포인트 부족' });
    const res = await DELETE(makeDeleteRequest({ postId: 'p1' }));
    expect(res.status).toBe(400);
  });
});
