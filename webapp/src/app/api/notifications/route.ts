// 내게 온 덧글 알림 (#237).
//
// 목록과 안 읽은 수를 함께 준다. 뱃지만 필요한 곳(navbar)도 이 응답의 unreadCount 만 쓴다 —
// 지금 규모에서 엔드포인트를 둘로 나눌 이유가 없다.
import { NextResponse } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { listNotifications } from '@/lib/notifications';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  return apiSuccess(await listNotifications(auth.email));
}
