// app/api/post/route.ts
import { deletePost, getPost } from '@/lib/posts';
import { auth } from "@/auth";
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const _id = searchParams.get('_id') || '';

  console.assert(_id, 'Post ID (_id) is required');
  console.log(`Fetching post with ID: ${_id}`);

  const { post } = await getPost(_id) || { post: null };
  return NextResponse.json(post);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

    const { postId } = await req.json();
  const userEmail = session.user.email;

  const result = await deletePost(postId, userEmail);

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}