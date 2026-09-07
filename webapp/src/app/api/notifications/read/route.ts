// Marks one notification as read (#247).
//
// Opening `/notifications` used to mark everything read (seen). The marking then vanished on a single reload,
// leaving no way to know what was still unhandled. Now only the one item is marked read **when it is tapped and
// followed to its comment**.
//
// Someone else's notifications cannot be touched - the id goes only into **that user's own document's list**, and the
// unread decision is already limited to "addressed to me" by `notificationFilter`. Putting in someone else's comment
// id affects their list not at all, and never matches in one's own.
import { NextResponse } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import User from '@/models/user';
import { nextReadIds } from '@/lib/notification-read';

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // A malformed body does not blow up with a 500 - there is no reason to see an error page over one notification.
  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return apiError('잘못된 요청입니다.', 400);
  }
  if (typeof id !== 'string' || !id) return apiError('id 가 필요합니다.', 400);

  await connectToDB();

  // Honouring the cap needs the current list, so it reads and writes ($addToSet cannot apply a cap).
  // One person tapping two at once could overwrite one of them, but tapping again is enough,
  // so it is not worth a transaction.
  const me = await User.findOne({ email: auth.email })
    .select('notificationsReadIds')
    .lean<{ notificationsReadIds?: string[] } | null>();

  const notificationsReadIds = nextReadIds(me?.notificationsReadIds ?? [], id);
  await User.updateOne({ email: auth.email }, { $set: { notificationsReadIds } });

  return apiSuccess({ readIds: notificationsReadIds.length });
}
