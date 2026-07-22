// app/api/post/route.ts
import { deletePost, getPost } from '@/lib/posts';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { apiSuccess, apiError } from '@/lib/api-response';
import { auth } from '@/auth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const _id = searchParams.get('_id') || '';

  if (!_id) return apiError('Post ID (_id) is required', 400);

  // 비공개 글은 작성자 본인만 로드(편집). 세션 email 을 뷰어로 전달.
  const session = await auth();
  const { post } = await getPost(_id, session?.user?.email ?? null) || { post: null };
  return apiSuccess(post);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { postId } = await req.json();
  const result = await deletePost(postId, auth.email);

  if (!result.success) {
    return apiError(result.message, 400);
  }

  return apiSuccess(null, 200, result.message);
}
