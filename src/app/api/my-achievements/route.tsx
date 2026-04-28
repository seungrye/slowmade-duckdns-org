import { NextResponse } from "next/server";
import { getMyAchievements } from "@/lib/achievements";
import { requireAuth } from "@/lib/require-auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const achievements = await getMyAchievements(auth.email);
    return NextResponse.json(achievements);
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return NextResponse.json({ message: "업적을 불러오는 데 실패했습니다." }, { status: 500 });
  }
}
