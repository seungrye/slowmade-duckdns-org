import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMyAchievements } from "@/lib/achievements";

export async function GET() {
  const session = await auth();

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const achievements = await getMyAchievements(session.user.email);
    return NextResponse.json(achievements);
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return NextResponse.json({ message: "업적을 불러오는 데 실패했습니다." }, { status: 500 });
  }
}