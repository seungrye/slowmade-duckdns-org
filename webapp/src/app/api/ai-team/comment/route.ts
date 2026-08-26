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
import { isAiPingPongExhausted, AI_PINGPONG_LIMIT } from '@/lib/ai-team/pingpong-limit';

/**
 * 쓸 수 있는 이름은 이 둘뿐 — 키를 쥐었다고 아무 이름으로나 글을 쓸 수 없다.
 *
 * `minimax` 였던 자리를 `coder` 로 바꿨다 (#222). 코더 모델을 OpenRouter 의
 * `stealth/ox-alpha` 로 정하면서 페르소나 이름이 특정 벤더에 묶여 있을 이유가 없어졌다.
 * 모델은 언제든 갈릴 수 있지만 **역할은 그대로**다.
 */
const PERSONAS = ['claude', 'coder'] as const;

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

  // 사람 없이 AI 끼리 영원히 주고받는 것을 여기서 끊는다 (#268).
  //
  // 클로드는 마지막이 coder 면 답하고 코더는 마지막이 claude 면 답한다 — 서로 상대를
  // 깨우므로 사람이 다시 안 와도 멈추지 않는다. **프롬프트로 세게 하면 모델이 세다가
  // 틀린다.** 이 저장소의 자율성 잠금이 전부 구조인 것과 같은 이유로 서버가 막는다.
  //
  // 사람이 한 마디 하면 셈이 0 으로 돌아가 다시 열린다 — 막는 것은 대화가 아니라
  // "사람 없이 계속 도는 것" 이다.
  const 지난덧글 = await Comment.find({ post: postId, isDeleted: { $ne: true } })
    .sort({ createdAt: 1 })
    .select('isEnji')
    .lean<{ isEnji?: boolean }[]>();
  if (isAiPingPongExhausted((지난덧글 ?? []).map((c) => ({ isBot: c.isEnji === true })))) {
    return apiError(
      `사람 없이 AI 끼리 ${AI_PINGPONG_LIMIT}번 오갔습니다. 사람이 한 마디 할 때까지 멈춥니다.`,
      409,
    );
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
