import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { checkAndGrantPostCountAchievements } from "@/lib/achievements";
import { HydratedDocument } from "mongoose";
import User from "@/models/user";
import { AchievementType } from "@/models/achievement";

const POINTS_FOR_NEW_POST = parseInt(process.env.POINTS_FOR_NEW_POST || '5', 10);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: "로그인 후 이용해주세요." }, { status: 401 });
  }

  await connectToDB();
  const payload = await req.json();

  if (session.user?.email != payload?.userEmail) {
    console.error("사용자 이메일이 일치하지 않습니다.", {
      sessionEmail: session.user.email,
      payloadEmail: payload?.userEmail,
    });
    return NextResponse.json({ message: "사용자 정보가 일치하지 않습니다." }, { status: 403 });
  }

  if (!payload?.title || !payload?.jsonContent) {
    return NextResponse.json({ message: "모든 필드를 입력해주세요." }, { status: 400 });
  }

  try {
    let unlockedAchievements: HydratedDocument<AchievementType>[] = [];
    let pointsGained = 0;

    if (payload._id) {
      await Post.findByIdAndUpdate(payload._id, payload);
    } else {
      const newPost = new Post(payload);
      await newPost.save();

      // Grant points for new post
      await User.findOneAndUpdate({ email: payload.userEmail }, { $inc: { points: POINTS_FOR_NEW_POST } });
      pointsGained = POINTS_FOR_NEW_POST;
      console.log(`+${pointsGained} points granted to ${payload.userEmail} for new post.`);

      // 새 글 작성 후, 글 개수 관련 업적 확인
      unlockedAchievements = await checkAndGrantPostCountAchievements(payload.userEmail);
    }

    return NextResponse.json({ message: "게시글 저장 완료", unlockedAchievements, pointsGained }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "게시글 저장 실패", error }, { status: 500 });
  }
}
