import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import User from "@/models/user";
import { requireAuth } from "@/lib/require-auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    await connectToDB();
    const user = await User.findOne({ email: auth.email }).select('name email profileImage points createdAt');

    if (!user) {
      return NextResponse.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ message: "프로필 정보를 불러오는 데 실패했습니다." }, { status: 500 });
  }
}
