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

// The model fallback chain.
// - When the first model fails with a 503 (overloaded), a 429 (quota) or a network timeout, the next is tried.
// - enji prioritises *conversation quality* -> Gemma 4 31B (dense; knowledge benchmark 61 against 26B's 49)
//   comes first. Both have an RPD of 1,500, so the limit is the same, and 31B is slower but quality matters in conversation.
//   (painter puts 26B first for batch speed - its work is simpler.) The newer Gemini models follow as fallbacks.
const GEMINI_MODEL_CHAIN = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // A 503 UNAVAILABLE, a 429 RESOURCE_EXHAUSTED, a fetch failure, a headers timeout and the like are worth retrying.
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
        // An empty response is retried too (an empty response means nothing to the user).
        lastError = new Error(`Empty response from model ${model}`);
        continue;
      }
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[enji] model=${model} failed:`, msg.slice(0, 200));
      if (!isTransientGeminiError(err)) {
        // A non-transient error (a 400 invalid request, say) gives the same result on a fallback, so it stops at once.
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
 * (deprecated) The `/image <prompt>` migration notice.
 * From #201, image generation moved to painter-bot.
 * For a week, existing users get a notice posted as an enji comment.
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

  // #205 - letting it through on existence alone puts a comment on someone else's private post,
  // and below, 3000 characters of its body go to Gemini on their command.
  // It answers with the same 404 as an absent post, so existence is not revealed.
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

  // The `/image <prompt>` command moved to painter-bot in #201.
  // A notice comment is shown for a week during the migration (no Gemini, quota or generateImage call).
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

      // A failure notice is posted as an enji-bot comment, so the user does not poll forever.
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
