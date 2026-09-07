import { updatePostViews } from '@/lib/posts';
import { apiSuccess, apiError } from '@/lib/api-response';

/**
 * POST /api/post/view - increments the view count by 1.
 *
 * An endpoint that separates the view-count write from the view page's (page.tsx) render.
 * The render becomes pure, which makes ISR caching possible, and only real client visits are counted.
 * updatePostViews already handles excluding deleted posts and swallowing failures.
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
