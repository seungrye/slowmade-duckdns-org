// /api/fortune/seen - marking today's fortune as read (#388).
//
// POST: records seenAt on today's (KST) document (idempotent). Called when the bottom-right toast opens or closes.
//   seenAt is **the server field for the once-a-day decision** - with it set, the toast does not appear again.
// Scoped to the logged-in user, so nobody else's document can be touched.

import { apiSuccess, apiError } from "@/lib/api-response";
import { connectToDB } from "@/lib/db";
import { auth } from "@/auth";
import DailyFortune from "@/models/daily-fortune";
import { seoulDateKey } from "@/lib/birthday";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return apiError("로그인이 필요합니다.", 401);

  await connectToDB();
  const dateKey = seoulDateKey(new Date());
  // An already-seen document is not overwritten (preserving the first time it was seen) - idempotent through the seenAt: null condition.
  await DailyFortune.updateOne(
    { userEmail: email, dateKey, seenAt: null },
    { $set: { seenAt: new Date() } },
  );
  return apiSuccess({ ok: true });
}
