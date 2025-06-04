// app/api/posts/route.ts
import { NextResponse } from 'next/server';
import { getPaginatedPosts } from '@/lib/posts';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 9; // 한 페이지당 포스트 수

  const posts = await getPaginatedPosts(page, limit);
  return NextResponse.json(posts);
}
