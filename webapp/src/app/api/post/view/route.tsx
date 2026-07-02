import { updatePostViews } from '@/lib/posts';
import { apiSuccess, apiError } from '@/lib/api-response';

/**
 * POST /api/post/view — 조회수 1 증가.
 *
 * 뷰 페이지(page.tsx) 렌더에서 조회수 write 를 분리하기 위한 엔드포인트.
 * 렌더가 순수해져 ISR 캐싱이 가능해지고, 실제 클라이언트 방문만 카운트된다.
 * updatePostViews 는 삭제글 제외·실패 삼킴을 이미 처리한다.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON body', 400);
  }
  const id = (body as { id?: unknown })?.id;
  if (!id || typeof id !== 'string') {
    return apiError('Post id is required', 400);
  }
  await updatePostViews(id);
  return apiSuccess({ ok: true });
}
