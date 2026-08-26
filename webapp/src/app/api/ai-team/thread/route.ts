// AI 팀 요청 스레드 상세 (#207).
//
// 러너가 실제로 읽는 자리 — 요청 본문과 지금까지의 논의(덧글)를 함께 준다.
// 주인 이메일 같은 식별 정보는 싣지 않는다. AI 가 알 필요가 없고, 프롬프트에 실려
// 외부 모델로 나갈 값이라 적을수록 좋다.
import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { connectToDB } from '@/lib/db';
import Comment from '@/models/comment';
import Post from '@/models/post';
import { isObjectIdLike, requireAiTeam } from '@/lib/ai-team/guard';
import { aiTeamPostFilter, isAiTeamPost, type AiTeamPostFields } from '@/lib/ai-team/thread-match';
import { aiTurnsLeft } from '@/lib/ai-team/pingpong-limit';

/** 스레드가 길어져도 이만큼만. 러너의 프롬프트가 무한정 늘어나지 않게. */
const MAX_COMMENTS = 200;

/** 태그를 벗겨 평문으로. AI 가 읽을 것이라 마크업은 잡음이다. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

interface ThreadDoc extends AiTeamPostFields {
  _id: unknown;
  title?: string;
  htmlContent?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface CommentDoc {
  _id: unknown;
  parent?: unknown;
  author?: string;
  content?: string;
  isEnji?: boolean;
  createdAt?: Date | string;
}

export async function GET(req: NextRequest) {
  const gate = requireAiTeam(req);
  if (gate instanceof NextResponse) return gate;

  const postId = new URL(req.url).searchParams.get('postId');
  if (!postId) return apiError('postId가 필요합니다.', 400);
  if (!isObjectIdLike(postId)) return apiError('postId 형식이 올바르지 않습니다.', 400);

  await connectToDB();

  const post = await Post.findOne({ _id: postId, ...aiTeamPostFilter(gate.ownerEmail) })
    .select('_id title htmlContent tags userEmail isPrivate isDeleted createdAt updatedAt')
    .lean<ThreadDoc | null>();

  // 필터로 걸러 왔지만 문서 자체를 한 번 더 본다 — 질의가 한 번 어긋나도 여기서 막힌다.
  if (!isAiTeamPost(post, gate.ownerEmail)) {
    return apiError('요청 스레드를 찾을 수 없습니다.', 404);
  }

  const comments = await Comment.find({ post: postId, isDeleted: { $ne: true } })
    .sort({ createdAt: 1 })
    .limit(MAX_COMMENTS)
    .lean<CommentDoc[]>();

  return apiSuccess({
    postId: String(post!._id),
    title: post!.title ?? '',
    body: stripHtml(post!.htmlContent ?? ''),
    tags: post!.tags ?? [],
    createdAt: post!.createdAt ?? null,
    updatedAt: post!.updatedAt ?? null,
    // 앞으로 몇 번 더 말할 수 있나 (#268). **막는 쪽과 같은 함수를 쓴다** — 어긋나면
    // "한 번 남았다" 고 알려 놓고 거절하게 된다. 러너는 이 숫자를 보고 마무리를 짓는다.
    aiTurnsLeft: aiTurnsLeft((comments ?? []).map((c) => ({ isBot: c.isEnji === true }))),
    comments: (comments ?? []).map((c) => ({
      id: String(c._id),
      parentId: c.parent ? String(c.parent) : null,
      author: c.author ?? '',
      content: c.content ?? '',
      isBot: c.isEnji === true,
      createdAt: c.createdAt ?? null,
    })),
  });
}
