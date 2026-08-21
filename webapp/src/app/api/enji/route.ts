import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-response';
import Comment from '@/models/comment';
import Post from '@/models/post';
import User from '@/models/user';
import { connectToDB } from '@/lib/db';
import { canCommentOn } from '@/lib/post-access';
import { env } from '@/lib/env';
import { nanoid } from 'nanoid';
import { parseImageCommand } from '@/lib/enji/imageGen';

const ENJI_SYSTEM_PROMPT = `당신은 "enji-bot"입니다. 유머 콘텐츠 사이트의 AI 비서입니다.
- 친근하고 유쾌한 말투로 한국어로 답변합니다.
- 게시글과 댓글 컨텍스트를 참고하여 답변합니다.
- 간결하게 (3~5문장 이내) 답변합니다.
- 유머 사이트답게 위트 있게, 하지만 도움이 되는 답변을 합니다.`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAllowedOrigin(req: NextRequest): boolean {
  const siteUrl = env.siteUrl.replace(/\/$/, '');
  const origin = req.headers.get('origin') ?? '';
  const referer = req.headers.get('referer') ?? '';
  return origin.startsWith(siteUrl) || referer.startsWith(siteUrl);
}

// 모델 fallback chain.
// - 첫 번째 모델이 503(과부하)/429(쿼터)/네트워크 타임아웃으로 실패하면 다음 모델로 재시도.
// - enji 는 *대화 품질* 우선 → Gemma 4 31B(dense, knowledge 벤치 61 vs 26B 49)를
//   먼저. 둘 다 RPD 1,500 이라 한도는 동일하고, 31B 는 느리지만 대화엔 품질이 중요.
//   (painter 는 배치 속도 위해 26B 우선 — 거긴 작업이 단순.) 이후 신세대 Gemini 폴백.
const GEMINI_MODEL_CHAIN = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // 503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED, fetch failed, headers timeout 등은 재시도 가치 있음.
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|HEADERS_TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND)\b/i.test(msg);
}

async function callGemini(contextMessage: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  let lastError: unknown;
  for (const model of GEMINI_MODEL_CHAIN) {
    try {
      const result = await ai.models.generateContent({
        model,
        config: { systemInstruction: ENJI_SYSTEM_PROMPT },
        contents: contextMessage,
      });
      const text = result.text ?? '';
      if (!text.trim()) {
        // 빈 응답도 재시도 대상 (응답이 비면 사용자에게 의미가 없음).
        lastError = new Error(`Empty response from model ${model}`);
        continue;
      }
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[enji] model=${model} failed:`, msg.slice(0, 200));
      if (!isTransientGeminiError(err)) {
        // 비-transient 에러(예: 400 invalid request)는 fallback 해도 동일 결과이므로 즉시 중단.
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function saveEnjiComment(
  postId: string,
  parentId: string,
  text: string,
  extras?: { imageUrl?: string; imagePrompt?: string },
) {
  const enjiComment = new Comment({
    post: postId,
    parent: parentId,
    content: text,
    author: 'enji-bot',
    authorId: null,
    isEnji: true,
    imageUrl: extras?.imageUrl ?? null,
    imagePrompt: extras?.imagePrompt ?? null,
  });
  await enjiComment.save();
  return enjiComment;
}

/**
 * (deprecated) `/image <prompt>` 마이그레이션 안내.
 * #201 부터 이미지 생성은 painter-bot 으로 이전됨.
 * 1주일간 기존 사용자에게 안내 메시지를 enji 댓글로 등록.
 */
async function handleImageMigrationNotice(
  postId: string,
  parentCommentId: string,
): Promise<void> {
  try {
    await saveEnjiComment(
      postId,
      parentCommentId,
      '이미지 생성은 이제 @painter-bot 을 멘션해 주세요. 예: `@painter-bot 한국 마을 광장 도트` — 멘션 뒤에 원하는 그림을 자유롭게 적으시면 됩니다.',
    );
  } catch (saveErr) {
    console.error('[enji-image] failed to save migration notice:', saveErr);
  }
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return apiError('허용되지 않은 요청입니다.', 403);
  }

  if (!env.geminiApiKey) {
    return apiError('Gemini API 키가 설정되지 않았습니다.', 503);
  }

  const session = await auth();
  if (!session?.user) {
    return apiError('로그인이 필요합니다.', 401);
  }

  const { postId, parentId = null, content, anonid } = await req.json();

  if (!content?.trim()) return apiError('댓글 내용이 없습니다.', 400);
  if (!postId) return apiError('postId가 필요합니다.', 400);

  await connectToDB();

  // #205 — 존재만 확인하고 통과시키면 남의 비공개 글에 덧글이 들어가고,
  // 아래에서 그 본문 3000자가 남의 명령으로 Gemini 에 실려 나간다.
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

  // `/image <prompt>` 명령어는 #201 부터 painter-bot 으로 이전됨.
  // 마이그레이션 1주일간 안내 댓글 표시 (Gemini/quota/generateImage 호출 X).
  const imageCmd = parseImageCommand(content);
  if (imageCmd) {
    void handleImageMigrationNotice(postId, String(userComment._id));
    return NextResponse.json({ success: true, data: { userComment } }, { status: 201 });
  }

  const recentComments = await Comment.find({ post: postId, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const commentContext = recentComments
    .reverse()
    .map(c => `${c.author}: ${c.content}`)
    .join('\n');

  const postText = stripHtml(post.htmlContent).slice(0, 3000);
  const query = content.replace(/@enji-bot/gi, '').trim() || '안녕하세요!';
  const contextMessage = `[게시글 제목]: ${post.title}\n[게시글 내용]: ${postText}\n[최근 댓글]:\n${commentContext}\n\n[사용자 질문]: ${query}`;

  void callGemini(contextMessage)
    .then((text) => saveEnjiComment(postId, String(userComment._id), text))
    .catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      const cause = (err as { cause?: unknown })?.cause;
      console.error('[enji] background failed:', msg);
      if (err instanceof Error && err.stack) {
        console.error('[enji] stack:', err.stack.split('\n').slice(0, 5).join('\n'));
      }
      if (cause) console.error('[enji] cause:', cause);

      // 사용자가 영원히 폴링하지 않도록, 실패 안내를 enji-bot 댓글로 등록.
      try {
        await saveEnjiComment(
          postId,
          String(userComment._id),
          '죄송해요, 지금은 답변 드리기 어려운 상태예요. 잠시 후 다시 멘션해 주세요. (모델 일시 과부하)',
        );
      } catch (saveErr) {
        console.error('[enji] failed to save error comment:', saveErr);
      }
    });

  return NextResponse.json({ success: true, data: { userComment } }, { status: 201 });
}
