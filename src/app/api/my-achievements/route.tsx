import { NextResponse } from "next/server";
import { apiSuccess, apiError } from '@/lib/api-response';
import { getMyAchievements } from "@/lib/achievements";
import { requireAuth } from "@/lib/require-auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const achievements = await getMyAchievements(auth.email);
    return apiSuccess(achievements);
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return apiError("업적을 불러오는 데 실패했습니다.", 500);
  }
}
