import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '@/auth';
import { apiSuccess, apiError } from '@/lib/api-response';
import Comment from '@/models/comment';
import Post from '@/models/post';
import User from '@/models/user';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import { nanoid } from 'nanoid';

const ENJI_SYSTEM_PROMPT = `당신은 "enji"입니다. 유머 콘텐츠 사이트의 AI 비서입니다.
- 친근하고 유쾌한 말투로 한국어로 답변합니다.
- 게시글과 댓글 컨텍스트를 참고하여 답변합니다.
- 간결하게 (3~5문장 이내) 답변합니다.
- 유머 사이트답게 위트 있게, 하지만 도움이 되는 답변을 합니다.`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  if (!env.geminiApiKey) {
    return apiError('Gemini API 키가 설정되지 않았습니다.', 503);
  }

  const session = await auth();
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
  const query = content.replace(/@enji/gi, '').trim() || '안녕하세요!';

  const contextMessage = `
[게시글 제목]: ${post.title}
[게시글 내용]: ${postText}
[최근 댓글]:
${commentContext}

[사용자 질문]: ${query}
`.trim();

  let enjiText: string;
  try {
    const genAI = new GoogleGenerativeAI(env.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: ENJI_SYSTEM_PROMPT,
    });
    const result = await model.generateContent(contextMessage);
    enjiText = result.response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { success: true, data: { userComment, enjiComment: null } },
      { status: 201 }
    );
  }

  const enjiComment = new Comment({
    post: postId,
    parent: userComment._id,
    content: enjiText,
    author: 'enji',
    authorId: null,
    isEnji: true,
  });
  await enjiComment.save();

  return apiSuccess({ userComment, enjiComment }, 201);
}
