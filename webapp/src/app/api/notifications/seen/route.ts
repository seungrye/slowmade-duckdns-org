// 알림을 확인했다고 표시한다 (#237).
//
// 항목별 읽음 플래그는 두지 않는다 — 타임스탬프 하나면 충분하고, 목록은 이 시각과 무관하게
// **항상 최근 20건**을 보여 주므로 읽었다고 사라지지 않는다. 굵게 표시만 풀린다.
import { NextResponse } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import User from '@/models/user';

export async function POST() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  await connectToDB();
  const seenAt = new Date();
  await User.updateOne({ email: auth.email }, { $set: { notificationsSeenAt: seenAt } });

  return apiSuccess({ seenAt });
}
