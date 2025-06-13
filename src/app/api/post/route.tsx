// app/api/post/route.ts
import { getPost } from '@/lib/posts';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const _id = searchParams.get('_id') || '';

  console.assert(_id, 'Post ID (_id) is required');
  console.log(`Fetching post with ID: ${_id}`);

  const post = await getPost(_id);
  return NextResponse.json(post);
}
