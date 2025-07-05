// app/api/posts/[id]/delete/route.ts
import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { deletePost } from '@/lib/posts';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const postId = params.id;
  const userEmail = session.user.email;

  const result = await deletePost(postId, userEmail);

  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}
