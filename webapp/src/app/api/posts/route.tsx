// app/api/posts/route.ts
import { getPaginatedPosts } from '@/lib/posts';
import { SortOptionSchema } from '@/lib/sort';
import { apiSuccess } from '@/lib/api-response';
import { auth } from '@/auth';

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

  // 제목 검색 (#232). 메인 화면은 9건씩 무한스크롤이라 **불러온 것만 거르면 안 된다** —
  // "검색했는데 없다"가 거짓이 되므로 전체에서 서버가 찾는다.
  // 공백만이면 검색어로 치지 않는다: 검색창을 비우면 전체 목록으로 돌아와야 한다.
  const q = searchParams.get('q')?.trim() || null;

  // 로그인한 작성자는 자기 비공개 글도 목록에 보인다(viewer=세션 email).
  const session = await auth();
  const posts = await getPaginatedPosts(page, limit, order, email, withComments, session?.user?.email ?? null, q);
  return apiSuccess(posts);
}
