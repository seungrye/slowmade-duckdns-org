import { NextResponse } from "next/server";
import { apiSuccess, apiError } from '@/lib/api-response';
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { evaluateAndGrant, type GrantedAchievement } from "@/lib/achievements";
import User from "@/models/user";
import { HttpStatusCode } from "axios";
import PostRevision from "@/models/post-revision";
import { generateAndUpdateTags } from "@/lib/tags/suggest-tags";
import { env } from "@/lib/env";
import { requireAuth } from "@/lib/require-auth";
import { revalidatePath } from "next/cache";

const POINTS_FOR_NEW_POST = env.points.newPost;

// Tidying the attachment metadata - only the allowed fields rather than whatever object the client sent (preventing mass assignment). At most 20.
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
    let unlockedAchievements: GrantedAchievement[] = [];
    let pointsGained = 0;

    if (payload._id) {
      // --- Editing a post ---
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

      // 2. Update the original post and bump the version
      const { title, htmlContent, jsonContent, tags } = payload;
      existingPost.set({
        title, htmlContent, jsonContent, tags,
        isPrivate: !!payload.isPrivate,
        attachments: sanitizeAttachments(payload.attachments),
      });
      existingPost.version += 1;

      await existingPost.save();
      // A public post is statically generated, so its view path is invalidated for the edit to show (replacing the removed revalidate).
      revalidatePath(`/post/view/${payload._id}`);
    } else {
      // Preventing mass assignment - allowed fields only. author and userEmail are forced by the server (blocking client forgery),
      // and likes, views, version and isDeleted use the schema's defaults (the client cannot set them).
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

      // A new post: AI tags are suggested and added in the background from the title, the body **and the attached images**
      // (with no revision). It does not block the response (fire and forget).
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

      // Everything is re-evaluated - writing changes more than the post achievements (streaks, exploration and so on).
      unlockedAchievements = await evaluateAndGrant(payload.userEmail);
    }

    return apiSuccess({ unlockedAchievements, pointsGained }, HttpStatusCode.Created, "게시글 저장 완료");
  } catch {
    return apiError("게시글 저장 실패", HttpStatusCode.InternalServerError);
  }
}
