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
import { generateAndUpdateTags } from "@/lib/tags/suggest-tags";
import { env } from "@/lib/env";
import { requireAuth } from "@/lib/require-auth";
import { revalidatePath } from "next/cache";

const POINTS_FOR_NEW_POST = env.points.newPost;

// 첨부 메타 정리 — 클라가 보낸 임의 객체 대신 허용 필드만(mass-assignment 방지). 최대 20개.
function sanitizeAttachments(raw: unknown): { id: string; name: string; key: string; size: number; mimeType: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map((a) => ({
      id: String(a?.id ?? ""),
      name: String(a?.name ?? ""),
      key: String(a?.key ?? ""),
      size: Number(a?.size ?? 0),
      mimeType: String(a?.mimeType ?? ""),
    }))
    .filter((a) => a.key && a.name);
}

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
      existingPost.set({
        title, htmlContent, jsonContent, tags,
        isPrivate: !!payload.isPrivate,
        attachments: sanitizeAttachments(payload.attachments),
      });
      existingPost.version += 1;

      await existingPost.save();
      // 공개 글은 정적 생성돼 있으므로 수정 반영을 위해 해당 뷰 경로를 무효화(revalidate 제거 대체).
      revalidatePath(`/post/view/${payload._id}`);
    } else {
      // Mass Assignment 방지 — 허용 필드만. author/userEmail 은 서버가 강제(클라 위조 차단),
      // likes/views/version/isDeleted 는 스키마 기본값 사용(클라가 못 정함).
      const authorUser = await User.findOne({ email: auth.email }).lean<{ username?: string } | null>();
      const userTags = Array.isArray(payload.tags) ? payload.tags : [];
      const created = await Post.create({
        title: payload.title,
        htmlContent: payload.htmlContent,
        jsonContent: payload.jsonContent,
        urls: Array.isArray(payload.urls) ? payload.urls : [],
        tags: userTags,
        isPrivate: !!payload.isPrivate,
        attachments: sanitizeAttachments(payload.attachments),
        userEmail: auth.email,
        author: authorUser?.username ?? auth.email,
      });

      // 신규 글: 제목·본문 **그리고 첨부 이미지**로 AI 태그를 백그라운드 추천·추가
      // (리비전 없이). 응답을 막지 않는다(fire-and-forget).
      void generateAndUpdateTags(created._id.toString(), {
        title: payload.title,
        htmlContent: payload.htmlContent,
        userTags,
        imageUrls: payload.urls,
      }).catch((e) => console.warn('[submit] AI 태그 트리거 실패:', e));

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
