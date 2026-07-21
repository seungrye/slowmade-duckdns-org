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

  const htmlBytes = Buffer.byteLength(payload.htmlContent ?? '', 'utf8');
  const jsonBytes = Buffer.byteLength(JSON.stringify(payload.jsonContent ?? {}), 'utf8');
  if (htmlBytes > 2 * 1024 * 1024 || jsonBytes > 2 * 1024 * 1024) {
    return apiError("게시글 본문이 너무 큽니다. (최대 2MB)", HttpStatusCode.PayloadTooLarge);
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

      if (existingPost.userEmail !== auth.email) {
        return apiError("수정 권한이 없습니다.", HttpStatusCode.Forbidden);
      }

      const {_id, ...postData } = existingPost.toObject();
      await PostRevision.create({
        ...postData,
        postId: _id,
        createdAt: existingPost.updatedAt,
      });

      // 2. 원본 게시글 업데이트 및 버전 증가
      const { title, htmlContent, jsonContent, tags } = payload;
      existingPost.set({ title, htmlContent, jsonContent, tags });
      existingPost.version += 1;

      await existingPost.save();
    } else {
      // Mass Assignment 방지 — 허용 필드만. author/userEmail 은 서버가 강제(클라 위조 차단),
      // likes/views/version/isDeleted 는 스키마 기본값 사용(클라가 못 정함).
      const authorUser = await User.findOne({ email: auth.email }).lean<{ username?: string } | null>();
      await Post.create({
        title: payload.title,
        htmlContent: payload.htmlContent,
        jsonContent: payload.jsonContent,
        urls: Array.isArray(payload.urls) ? payload.urls : [],
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        userEmail: auth.email,
        author: authorUser?.username ?? auth.email,
      });

      // Grant points for new post
      await User.findOneAndUpdate({ email: auth.email }, { $inc: { points: POINTS_FOR_NEW_POST } });
      pointsGained = POINTS_FOR_NEW_POST;
      console.log(`+${pointsGained} points granted for new post.`);

      // 새 글 작성 후, 글 개수 관련 업적 확인
      unlockedAchievements = await checkAndGrantPostCountAchievements(payload.userEmail);
    }

    return apiSuccess({ unlockedAchievements, pointsGained }, HttpStatusCode.Created, "게시글 저장 완료");
  } catch {
    return apiError("게시글 저장 실패", HttpStatusCode.InternalServerError);
  }
}
