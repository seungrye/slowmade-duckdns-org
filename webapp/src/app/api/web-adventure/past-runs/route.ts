// /api/web-adventure/past-runs — 회차 history 조회 (#239).
//
// 자기 user 의 past_run 목록 (runIndex 내림차순). 갤러리/통계용.
//
// #293 — 페이지네이션 (limit). 운영에서 3000+ 회차 누적 시 826KB 응답 = 모바일
//   부담. 갤러리/buildWorldFlags 는 *unique endingId* 만 필요. 기본 limit 500 이면
//   *충분* (모든 endingId 다양성 보존). 호출자가 명시적으로 더 큰 값 가능.

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

  // limit 파싱 — 1 이상, MAX_LIMIT 이하. 기본 500.
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
