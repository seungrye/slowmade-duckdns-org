// app/api/posts/route.ts
import { getPaginatedPosts } from '@/lib/posts';
import { SortOptionSchema } from '@/lib/sort';
import { apiSuccess } from '@/lib/api-response';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
  const limit = Math.min(parseInt(searchParams.get('limit') || '9', 10), 50);
  const email = searchParams.get('email') || null;

  const rawSort = searchParams.get('sort') || 'latest'; // 기본값 'latest'로 설정
  const parseResult = SortOptionSchema.safeParse(rawSort);
  console.assert(parseResult.success, `Invalid sort option: ${rawSort}. Expected one of: latest, popular, commented.`);
  const order = parseResult.data;

  const withComments = true;

  const posts = await getPaginatedPosts(page, limit, order, email, withComments);
  return apiSuccess(posts);
}
