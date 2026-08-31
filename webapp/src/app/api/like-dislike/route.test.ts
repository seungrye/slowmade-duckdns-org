import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/post', () => ({ default: { findByIdAndUpdate: vi.fn(), findById: vi.fn() } }));
vi.mock('@/models/user', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/lib/achievements', () => ({ evaluateAndGrantForPost: vi.fn() }));

import { GET, POST } from './route';
import { auth } from '@/auth';
import Post from '@/models/post';
import User from '@/models/user';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockPostFindByIdAndUpdate = Post.findByIdAndUpdate as ReturnType<typeof vi.fn>;
const mockPostFindById = Post.findById as ReturnType<typeof vi.fn>;
// findById(...).select(...).lean() 체인 목 — 비공개 가드가 참조.
const stubPost = (post: unknown) =>
  mockPostFindById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(post) }) });
const mockUserFindOne = User.findOne as ReturnType<typeof vi.fn>;
const mockUserFindOneAndUpdate = User.findOneAndUpdate as ReturnType<typeof vi.fn>;

function makeGetRequest(postId?: string) {
  const url = postId
    ? `http://localhost/api/like-dislike?postId=${postId}`
    : 'http://localhost/api/like-dislike';
  return new Request(url) as never;
}

function makePostRequest(body: object) {
  return new Request('http://localhost/api/like-dislike', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/like-dislike', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('인증되지 않으면 401을 반환한다', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeGetRequest('post123'));
    expect(res.status).toBe(401);
  });

  it('postId가 없으면 400을 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' }, expires: '' });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it('사용자를 찾을 수 없으면 404를 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' }, expires: '' });
    mockUserFindOne.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    const res = await GET(makeGetRequest('post123'));
    expect(res.status).toBe(404);
  });

  it('사용자가 좋아요한 게시글이면 isLiked: true를 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' }, expires: '' });
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ likedPosts: ['post123', 'post456'] }),
      }),
    });
    const res = await GET(makeGetRequest('post123'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.isLiked).toBe(true);
  });

  it('사용자가 좋아요하지 않은 게시글이면 isLiked: false를 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' }, expires: '' });
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ likedPosts: ['other-post'] }),
      }),
    });
    const res = await GET(makeGetRequest('post123'));
    const { data } = await res.json();
    expect(data.isLiked).toBe(false);
  });

  it('likedPosts가 없는 사용자는 isLiked: false를 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' }, expires: '' });
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ likedPosts: undefined }),
      }),
    });
    const res = await GET(makeGetRequest('post123'));
    const { data } = await res.json();
    expect(data.isLiked).toBe(false);
  });
});

describe('POST /api/like-dislike', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' }, expires: '' });
    mockPostFindByIdAndUpdate.mockResolvedValue({ likes: 1 });
    mockUserFindOneAndUpdate.mockResolvedValue({});
    stubPost({ isPrivate: false, userEmail: 'someone@test.com' }); // 기본: 공개글(가드 통과)
  });

  it('인증되지 않으면 401을 반환한다', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makePostRequest({ _id: 'post123', likeChecked: true }));
    expect(res.status).toBe(401);
  });

  it('_id가 없으면 400을 반환한다', async () => {
    const res = await POST(makePostRequest({ likeChecked: true }));
    expect(res.status).toBe(400);
  });

  it('likeChecked가 boolean이 아니면 400을 반환한다', async () => {
    const res = await POST(makePostRequest({ _id: 'post123', likeChecked: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('게시글이 없으면 404를 반환한다', async () => {
    stubPost(null); // 가드 단계에서 없음
    const res = await POST(makePostRequest({ _id: 'post123', likeChecked: true }));
    expect(res.status).toBe(404);
  });

  it('비공개 글은 작성자가 아니면 404(좋아요 조작 차단)', async () => {
    stubPost({ isPrivate: true, userEmail: 'author@test.com' }); // 뷰어(user@test.com)는 작성자 아님
    const res = await POST(makePostRequest({ _id: 'post123', likeChecked: true }));
    expect(res.status).toBe(404);
    expect(mockPostFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('비공개 글이라도 작성자 본인이면 좋아요 가능', async () => {
    stubPost({ isPrivate: true, userEmail: 'user@test.com' }); // 본인
    const res = await POST(makePostRequest({ _id: 'post123', likeChecked: true }));
    expect(res.status).toBe(200);
  });

  it('좋아요 성공 시 업데이트된 likes 수를 반환한다', async () => {
    mockPostFindByIdAndUpdate.mockResolvedValue({ likes: 5 });
    const res = await POST(makePostRequest({ _id: 'post123', likeChecked: true }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.likes).toBe(5);
  });

  it('좋아요하면 세션 이메일로 likedPosts에 추가한다', async () => {
    mockPostFindByIdAndUpdate.mockResolvedValue({ likes: 1 });
    await POST(makePostRequest({ _id: 'post123', likeChecked: true }));
    expect(mockUserFindOneAndUpdate).toHaveBeenCalledWith(
      { email: 'user@test.com' },
      { $addToSet: { likedPosts: 'post123' } }
    );
  });

  it('좋아요 취소하면 세션 이메일로 likedPosts에서 제거한다', async () => {
    mockPostFindByIdAndUpdate.mockResolvedValue({ likes: 0 });
    await POST(makePostRequest({ _id: 'post123', likeChecked: false }));
    expect(mockUserFindOneAndUpdate).toHaveBeenCalledWith(
      { email: 'user@test.com' },
      { $pull: { likedPosts: 'post123' } }
    );
  });

  it('payload.userEmail을 무시하고 세션 이메일을 사용한다', async () => {
    mockPostFindByIdAndUpdate.mockResolvedValue({ likes: 1 });
    await POST(makePostRequest({ _id: 'post123', likeChecked: true, userEmail: 'attacker@test.com' }));
    expect(mockUserFindOneAndUpdate).toHaveBeenCalledWith(
      { email: 'user@test.com' },
      expect.anything()
    );
  });
});
