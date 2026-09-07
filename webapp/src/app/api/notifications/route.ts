// The comment notifications addressed to me (#237).
//
// It returns the list and the unread count together. Places that need only the badge (the navbar) use just this
// response's unreadCount - at this scale there is no reason to split it into two endpoints.
import { NextResponse } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { listNotifications } from '@/lib/notifications';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  return apiSuccess(await listNotifications(auth.email));
}
