// Marks every notification read - the [mark all read] button (#237, #247).
//
// **It used to be called automatically merely by opening the page.** So the "unread" marking survived only the first
// render after a new comment and vanished on a reload - there was nothing left to see by the time you looked.
// Now the user has to press the button. Ordinary read-marking is `read`'s job, when an item is tapped.
//
// There is still no per-item flag - one baseline plus a list of ids newer than it is enough, and the list always
// shows **the most recent 20** regardless of this timestamp, so nothing disappears once read.
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
  // Once the baseline rises to now, every per-item id older than it is meaningless. Without clearing them the list
  // simply remains and eats into the cap (READ_IDS_CAP).
  await User.updateOne(
    { email: auth.email },
    { $set: { notificationsSeenAt: seenAt, notificationsReadIds: [] } },
  );

  return apiSuccess({ seenAt });
}
