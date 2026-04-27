import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDB } from "@/lib/db";
import User from "@/models/user";

export async function GET() {
  const session = await auth();

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    await connectToDB();
    // password는 제외하고 필요한 필드만 선택적으로 반환합니다.
    const user = await User.findOne({ email: session.user.email }).select('name email profileImage points createdAt');
    
    if (!user) {
        return NextResponse.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ message: "프로필 정보를 불러오는 데 실패했습니다." }, { status: 500 });
  }
}