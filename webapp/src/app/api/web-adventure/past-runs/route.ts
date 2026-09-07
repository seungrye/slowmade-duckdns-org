// /api/web-adventure/past-runs - reading the run history (#239).
//
// One's own user's past_run list (runIndex descending). For the gallery and the statistics.
//
// #293 - pagination (limit). In production, 3000+ accumulated runs made an 826KB response - crushing on mobile
//   at 826KB. The gallery and buildWorldFlags need only the *unique endingIds*. A default limit of 500 is
//   *ample* (preserving every endingId's variety). A caller may request more explicitly.

import { NextRequest } from 'next/server';
import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('로그인이 필요합니다.', 401);
  }

  // Parsing limit - at least 1, at most MAX_LIMIT. 500 by default.
  const url = new URL(req.url);
  const rawLimit = url.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (rawLimit) {
    const n = parseInt(rawLimit, 10);
    if (Number.isFinite(n) && n > 0) {
      limit = Math.min(n, MAX_LIMIT);
    }
  }

  await connectToDB();
  const list = await WebAdventurePastRun.find({ userEmail: session.user.email })
    .sort({ runIndex: -1 })
    .limit(limit)
    .lean();
  return apiSuccess(list);
}
