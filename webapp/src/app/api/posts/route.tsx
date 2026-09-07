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

  const rawSort = searchParams.get('sort') || 'latest'; // defaults to 'latest'
  const parseResult = SortOptionSchema.safeParse(rawSort);
  console.assert(parseResult.success, `Invalid sort option: ${rawSort}. Expected one of: latest, popular, commented.`);
  const order = parseResult.data;

  const withComments = true;

  // Title search (#232). The main screen infinite-scrolls 9 at a time, so **filtering only what is loaded is wrong** -
  // "searched and found nothing" would be a lie, so the server searches everything.
  // Whitespace alone does not count as a search term: clearing the search box must return the full list.
  const q = searchParams.get('q')?.trim() || null;

  // A logged-in author sees their own private posts in the list too (viewer = the session email).
  const session = await auth();
  const posts = await getPaginatedPosts(page, limit, order, email, withComments, session?.user?.email ?? null, q);
  return apiSuccess(posts);
}
