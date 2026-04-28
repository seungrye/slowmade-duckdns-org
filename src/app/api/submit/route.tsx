import { NextResponse } from "next/server";
import { apiSuccess, apiError } from '@/lib/api-response';
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { checkAndGrantPostCountAchievements } from "@/lib/achievements";
import { HydratedDocument } from "mongoose";
import User from "@/models/user";
import { AchievementType } from "@/models/achievement";
import { HttpStatusCode } from "axios";
import PostRevision from "@/models/post-revision";
import { env } from "@/lib/env";
import { requireAuth } from "@/lib/require-auth";

const POINTS_FOR_NEW_POST = env.points.newPost;

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  await connectToDB();
  const payload = await req.json();

  if (auth.email !== payload?.userEmail) {
    console.error("사용자 이메일이 일치하지 않습니다.", {
      sessionEmail: auth.email,
      payloadEmail: payload?.userEmail,
    });
    return apiError("사용자 정보가 일치하지 않습니다.", HttpStatusCode.Forbidden);
  }

  if (!payload?.title || !payload?.jsonContent) {
    return apiError("모든 필드를 입력해주세요.", HttpStatusCode.BadRequest);
  }

  try {
    let unlockedAchievements: HydratedDocument<AchievementType>[] = [];
    let pointsGained = 0;

    if (payload._id) {
      // --- 게시글 수정 ---
      const existingPost = await Post.findById(payload._id);
      if (!existingPost) {
        return apiError("게시글을 찾을 수 없습니다.", HttpStatusCode.NotFound);
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

    return apiSuccess({ unlockedAchievements, pointsGained }, HttpStatusCode.Created, "게시글 저장 완료");
  } catch {
    return apiError("게시글 저장 실패", HttpStatusCode.InternalServerError);
  }
}
