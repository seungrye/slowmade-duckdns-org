import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-response';
import Comment from '@/models/comment';
import Post from '@/models/post';
import User from '@/models/user';
import { connectToDB } from '@/lib/db';
import { canCommentOn } from '@/lib/post-access';
import { env } from '@/lib/env';
import { nanoid } from 'nanoid';
import { translateAndGenerate } from '@/lib/painter/imageGen';
import { tryConsumeDailyQuota } from '@/lib/painter/quota';
import { getMinioClient } from '@/lib/minio-client';

function isAllowedOrigin(req: NextRequest): boolean {
  const siteUrl = env.siteUrl.replace(/\/$/, '');
  const origin = req.headers.get('origin') ?? '';
  const referer = req.headers.get('referer') ?? '';
  return origin.startsWith(siteUrl) || referer.startsWith(siteUrl);
}

/**
 * @painter-bot 멘션을 제거하여 순수 prompt 만 추출.
 * - 멘션 없으면 전체 content 를 prompt 로 사용.
 * - 양 끝 공백/멘션 흔적 제거.
 */
function extractPrompt(content: string): string {
  return content.replace(/@painter-bot/gi, '').trim();
}

async function savePainterComment(
  postId: string,
  parentId: string,
  text: string,
  extras?: { imageUrl?: string; imagePrompt?: string },
) {
  const painterComment = new Comment({
    post: postId,
    parent: parentId,
    content: text,
    author: 'painter-bot',
    authorId: null,
    isEnji: true, // 봇 댓글 (✨ 스타일 재사용 — comment-item.tsx 의 분기 트리거)
    imageUrl: extras?.imageUrl ?? null,
    imagePrompt: extras?.imagePrompt ?? null,
  });
  await painterComment.save();
  return painterComment;
}

/**
 * painter-bot 의 이미지 생성 백그라운드 처리.
 * - quota 체크 → Pollinations 호출 → MinIO 업로드 → 댓글 저장.
 * - 실패 시 안내 댓글 등록.
 */
async function handlePainterRequest(
  prompt: string,
  postId: string,
  parentCommentId: string,
): Promise<void> {
  try {
    const allowed = await tryConsumeDailyQuota(env.painterImage.dailyLimit);
    if (!allowed) {
      await savePainterComment(
        postId,
        parentCommentId,
        `오늘의 이미지 생성 한도(${env.painterImage.dailyLimit}장)를 모두 사용했어요. 내일 다시 시도해 주세요.`,
      );
      return;
    }

    const result = await translateAndGenerate(prompt, {
      minioClient: getMinioClient(),
      bucket: env.minio.bucket,
      endpoint: env.minio.publicHost, // public URL 은 apex 경로(publicHost) 기반
      geminiApiKey: env.geminiApiKey,
    });

    // 번역됐을 때: 원본 + 영문 번역본을 모두 표기.
    // 영문 / 번역 실패 시: 기존 단일 형식 유지.
    const commentText = result.translatedPrompt
      ? `🎨 "${result.originalPrompt}"\n↓\n"${result.translatedPrompt}"\n생성 완료`
      : `🎨 "${result.originalPrompt}" 생성 완료`;

    await savePainterComment(
      postId,
      parentCommentId,
      commentText,
      { imageUrl: result.url, imagePrompt: result.usedPrompt },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[painter-image] failed:', msg);
    try {
      await savePainterComment(
        postId,
        parentCommentId,
        '죄송해요, 그림 그리기에 실패했어요. 잠시 후 다시 시도해 주세요.',
      );
    } catch (saveErr) {
      console.error('[painter-image] failed to save error comment:', saveErr);
    }
  }
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return apiError('허용되지 않은 요청입니다.', 403);
  }

  const session = await auth();
  if (!session?.user) {
    return apiError('로그인이 필요합니다.', 401);
  }

  const { postId, parentId = null, content, anonid } = await req.json();

  if (!content?.trim()) return apiError('댓글 내용이 없습니다.', 400);
  if (!postId) return apiError('postId가 필요합니다.', 400);

  await connectToDB();

  // #205 — 존재만 확인하고 통과시키면 남의 비공개 글에 덧글이 들어간다.
  // 없을 때와 같은 404 로 답해 존재 여부를 알려 주지 않는다.
  const post = await Post.findById(postId).lean();
  if (!post || !canCommentOn(post, session.user.email)) {
    return apiError('게시글을 찾을 수 없습니다.', 404);
  }

  let author: string;
  let authorId = null;

  if (session?.user) {
    author = session.user.name ?? 'accounted user';
    const user = await User.findOne({ email: session.user.email });
    if (user) authorId = user._id;
  } else {
    const charset = ['i', 'l', 'I', '|', '!'];
    const baseChars = '_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let num = BigInt(0);
    for (const char of (anonid ?? nanoid(8))) {
      const value = baseChars.indexOf(char);
      if (value === -1) continue;
      num = num * BigInt(62) + BigInt(value);
    }
    let result = '';
    const base = BigInt(charset.length);
    while (num > 0) {
      result = charset[Number(num % base)] + result;
      num = num / base;
    }
    author = result || charset[0];
  }

  const userComment = new Comment({ post: postId, parent: parentId, content, author, authorId });
  await userComment.save();

  // painter-bot 은 *모든 content 가 prompt*. 명령어 파싱 X.
  const prompt = extractPrompt(content);
  const finalPrompt = prompt || '아무거나 멋진 그림';

  void handlePainterRequest(finalPrompt, postId, String(userComment._id));

  return NextResponse.json({ success: true, data: { userComment } }, { status: 201 });
}
