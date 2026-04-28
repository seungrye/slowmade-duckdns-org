import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { auth } from "@/auth";
import { checkAndGrantPostCountAchievements } from "@/lib/achievements";
import { HydratedDocument } from "mongoose";
import User from "@/models/user";
import { AchievementType } from "@/models/achievement";
import { HttpStatusCode } from "axios";
import PostRevision from "@/models/post-revision";
import { env } from "@/lib/env";

const POINTS_FOR_NEW_POST = env.points.newPost;

export async function POST(req: Request) {
  const session = await auth();

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: "로그인 후 이용해주세요." }, { status: HttpStatusCode.Unauthorized });
  }

  await connectToDB();
  const payload = await req.json();

  if (session.user?.email !== payload?.userEmail) {
    console.error("사용자 이메일이 일치하지 않습니다.", {
      sessionEmail: session.user.email,
      payloadEmail: payload?.userEmail,
    });
    return NextResponse.json({ message: "사용자 정보가 일치하지 않습니다." }, { status: HttpStatusCode.Forbidden });
  }

  if (!payload?.title || !payload?.jsonContent) {
    return NextResponse.json({ message: "모든 필드를 입력해주세요." }, { status: HttpStatusCode.BadRequest });
  }

  try {
    let unlockedAchievements: HydratedDocument<AchievementType>[] = [];
    let pointsGained = 0;

    if (payload._id) {
      // --- 게시글 수정 ---
      const existingPost = await Post.findById(payload._id);
      if (!existingPost) {
        return NextResponse.json({ message: "게시글을 찾을 수 없습니다." }, { status: HttpStatusCode.NotFound });
      }

      const {_id, ...postData } = existingPost.toObject();
      await PostRevision.create({
        ...postData,
        postId: _id,
        createdAt: existingPost.updatedAt,
      });

      // 2. 원본 게시글 업데이트 및 버전 증가
      existingPost.set(payload);
      existingPost.version += 1;

      await existingPost.save();
    } else {
      await Post.create(payload);

      // Grant points for new post
      await User.findOneAndUpdate({ email: payload.userEmail }, { $inc: { points: POINTS_FOR_NEW_POST } });
      pointsGained = POINTS_FOR_NEW_POST;
      console.log(`+${pointsGained} points granted to ${payload.userEmail} for new post.`);

      // 새 글 작성 후, 글 개수 관련 업적 확인
      unlockedAchievements = await checkAndGrantPostCountAchievements(payload.userEmail);
    }

    return NextResponse.json({ message: "게시글 저장 완료", unlockedAchievements, pointsGained }, { status: HttpStatusCode.Created });
  } catch (error) {
    return NextResponse.json({ message: "게시글 저장 실패", error }, { status: HttpStatusCode.InternalServerError });
  }
}
