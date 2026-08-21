// AI 팀 덧글 쓰기 (#207).
//
// **이 저장소에서 세션 없이 글에 쓰기가 가능한 유일한 자리다.** 그래서 대상 글이 요청
// 스레드인지 다시 확인한다 — 키가 새더라도 주인의 `ai-req` 비공개 글 밖으로는 못 나간다.
//
// 사용자 계정을 만들지 않고 기존 봇 덧글 패턴(`authorId: null`, `isEnji: true`)을 그대로 쓴다.
// painter-bot·enji-bot 과 같은 모양이라 화면의 ✨ 스타일도 그대로 붙는다.
import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { connectToDB } from '@/lib/db';
import Comment from '@/models/comment';
import Post from '@/models/post';
import { isObjectIdLike, requireAiTeam } from '@/lib/ai-team/guard';
import { aiTeamPostFilter, isAiTeamPost, type AiTeamPostFields } from '@/lib/ai-team/thread-match';

/** 쓸 수 있는 이름은 이 둘뿐 — 키를 쥐었다고 아무 이름으로나 글을 쓸 수 없다. */
const PERSONAS = ['claude', 'minimax'] as const;

/** 사람 덧글(`/api/comments`)과 같은 한도. */
const MAX_CONTENT = 5000;

export async function POST(req: NextRequest) {
  const gate = requireAiTeam(req);
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError('본문을 읽을 수 없습니다.', 400);
  }

  const { postId, parentId = null, persona, content } = body ?? {};

  if (typeof persona !== 'string' || !(PERSONAS as readonly string[]).includes(persona)) {
    return apiError(`persona 는 ${PERSONAS.join(' | ')} 중 하나여야 합니다.`, 400);
  }
  if (typeof content !== 'string' || !content.trim()) {
    return apiError('덧글 내용이 없습니다.', 400);
  }
  if (content.length > MAX_CONTENT) {
    return apiError(`덧글이 너무 깁니다. (최대 ${MAX_CONTENT}자)`, 413);
  }
  if (!isObjectIdLike(postId)) {
    return apiError('postId 형식이 올바르지 않습니다.', 400);
  }

  await connectToDB();

  const post = await Post.findOne({ _id: postId, ...aiTeamPostFilter(gate.ownerEmail) })
    .select('_id userEmail isPrivate isDeleted tags')
    .lean<AiTeamPostFields | null>();

  // 마지막 방어선 — 여기서 막히면 키가 새도 요청 스레드 밖은 건드리지 못한다.
  if (!isAiTeamPost(post, gate.ownerEmail)) {
    return apiError('요청 스레드를 찾을 수 없습니다.', 404);
  }

  const comment = new Comment({
    post: postId,
    parent: typeof parentId === 'string' && parentId ? parentId : null,
    content,
    author: persona,
    authorId: null,
    isEnji: true, // 봇 덧글 (comment-item.tsx 의 ✨ 스타일 분기 트리거)
  });
  await comment.save();

  return apiSuccess({ commentId: String(comment._id) }, 201);
}
