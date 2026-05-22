import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-response';
import Comment from '@/models/comment';
import Post from '@/models/post';
import User from '@/models/user';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import { nanoid } from 'nanoid';

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

async function callGemini(contextMessage: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const result = await ai.models.generateContent({
    model: 'gemini-flash-latest',
    config: { systemInstruction: ENJI_SYSTEM_PROMPT },
    contents: contextMessage,
  });
  return result.text ?? '';
}

async function saveEnjiComment(postId: string, parentId: string, text: string) {
  const enjiComment = new Comment({
    post: postId,
    parent: parentId,
    content: text,
    author: 'enji-bot',
    authorId: null,
    isEnji: true,
  });
  await enjiComment.save();
  return enjiComment;
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

  const post = await Post.findById(postId).lean();
  if (!post) return apiError('게시글을 찾을 수 없습니다.', 404);

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
    .catch((err) => console.error('Background enji error:', err));

  return NextResponse.json({ success: true, data: { userComment } }, { status: 201 });
}
