// 알림을 전부 읽음으로 표시한다 — [모두 읽음] 버튼 (#237, #247).
//
// **예전엔 페이지를 여는 것만으로 자동 호출됐다.** 그래서 "안 읽음" 표시는 새 덧글이 온 뒤
// 첫 렌더 한 번만 살아있고 새로고침하면 사라졌다 — 정작 볼 때는 볼 것이 없었다.
// 지금은 사용자가 버튼을 눌러야 한다. 평소 읽음 처리는 항목을 누를 때 `read` 가 한다.
//
// 항목별 플래그는 여전히 두지 않는다 — 기준선 하나 + 그보다 새 것의 id 목록이면 충분하고,
// 목록은 이 시각과 무관하게 **항상 최근 20건**을 보여 주므로 읽었다고 사라지지 않는다.
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
  // 기준선이 now 로 올라가면 그보다 오래된 개별 id 는 전부 의미가 없다. 안 비우면
  // 목록만 남아 상한(READ_IDS_CAP)을 갉아먹는다.
  await User.updateOne(
    { email: auth.email },
    { $set: { notificationsSeenAt: seenAt, notificationsReadIds: [] } },
  );

  return apiSuccess({ seenAt });
}
