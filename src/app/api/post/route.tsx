// app/api/post/route.ts
import { deletePost, getPost } from '@/lib/posts';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const _id = searchParams.get('_id') || '';

  if (!_id) return NextResponse.json({ message: 'Post ID (_id) is required' }, { status: 400 });

  const { post } = await getPost(_id) || { post: null };
  return NextResponse.json(post);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { postId } = await req.json();
  const result = await deletePost(postId, auth.email);

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}
