import { NextResponse } from "next/server";
import { apiSuccess, apiError } from '@/lib/api-response';
import { achievementView } from "@/lib/achievements";
import { requireAuth } from "@/lib/require-auth";

/**
 * My achievements (#333).
 *
 * It returns what was earned together with **what is in progress**. It used to return only what was earned, leaving
 * no way to know what to aim for. Hidden achievements are masked by `achievementView` **on the server** - masking on
 * the client leaves them all visible in devtools.
 *
 * It re-evaluates on read, so opening the profile grants the backlog retroactively.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    return apiSuccess(await achievementView(auth.email));
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return apiError("업적을 불러오는 데 실패했습니다.", 500);
  }
}
