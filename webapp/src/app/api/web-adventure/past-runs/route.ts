// /api/web-adventure/past-runs — 회차 history 조회 (#239).
//
// 자기 user 의 past_run 목록 (runIndex 내림차순). 갤러리/통계용.

import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('로그인이 필요합니다.', 401);
  }
  await connectToDB();
  const list = await WebAdventurePastRun.find({ userEmail: session.user.email })
    .sort({ runIndex: -1 })
    .lean();
  return apiSuccess(list);
}
