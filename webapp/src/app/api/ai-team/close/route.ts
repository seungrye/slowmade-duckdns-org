// AI 팀 스레드 닫기 (#222).
//
// **#213 의 결정을 뒤집는다.** 그때는 "닫는 주체는 사람"이라 못박았고 이유도 적어 뒀다 —
// AI 가 스스로 닫으면 성급하게 닫을 위험이 있고, 자율성 (A) 상 AI 는 덧글만 단다는 것.
// 주인이 요청 스레드에서 그 권한을 AI 에 위임하기로 정해 이 라우트가 생겼다.
//
// 뒤집힌 결정에는 이유를 남긴다 — 이유 없이 뒤집힌 결정은 다음 사람이 또 뒤집는다.
// 위임이 안전한 근거는 **되돌리기가 싸다**는 것이다: 사람이 `ai-done` 태그를 떼면 스레드가
// 그대로 다시 열린다. 글도 덧글도 그대로 남는다.
//
// ── 왜 postId 하나만 받는가 ──────────────────────────────────────────────
//
// 태그 배열을 받으면 이 통로로 `ai-req` 를 **뗄 수 있다.** 그러면 그 글이 요청이었다는
// 기록이 사라지고 되돌릴 근거도 없어진다. #213 이 "떼지 말고 더한다"로 정한 이유가 그것이다.
// 그래서 받는 것은 postId 뿐이고, 더하는 태그는 코드가 고른다.
//
// ── 순서는 코드가 강제한다 ───────────────────────────────────────────────
//
// 닫고 나면 `isAiTeamPost` 가 이 글을 거부하므로 **그 뒤로는 덧글을 못 단다**
// (`comment/route.ts` 가 쓰기 직전 같은 검사를 통과한다). 즉 닫는 이유를 적을 기회는
// 닫기 **전**뿐이다. 러너 프롬프트도 그렇게 지시한다.
import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { connectToDB } from '@/lib/db';
import Post from '@/models/post';
import { isObjectIdLike, requireAiTeam } from '@/lib/ai-team/guard';
import {
  AI_DONE_TAG,
  aiTeamPostFilter,
  isAiTeamPost,
  type AiTeamPostFields,
} from '@/lib/ai-team/thread-match';

export async function POST(req: NextRequest) {
  const gate = requireAiTeam(req);
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError('본문을 읽을 수 없습니다.', 400);
  }

  // 본문에 tags 가 실려 와도 보지 않는다 — 위 주석 참고.
  const { postId } = body ?? {};
  if (!isObjectIdLike(postId)) {
    return apiError('postId 형식이 올바르지 않습니다.', 400);
  }

  await connectToDB();

  const post = await Post.findOne({ _id: postId, ...aiTeamPostFilter(gate.ownerEmail) })
    .select('_id userEmail isPrivate isDeleted tags')
    .lean<AiTeamPostFields | null>();

  // 이미 닫힌 글도 여기서 걸린다 — 더는 AI 팀 스레드가 아니므로 404 가 맞는 응답이다.
  if (!isAiTeamPost(post, gate.ownerEmail)) {
    return apiError('요청 스레드를 찾을 수 없습니다.', 404);
  }

  await Post.findByIdAndUpdate(
    postId,
    { $addToSet: { tags: AI_DONE_TAG } },
    // 봇이 태그 하나 붙였다고 주인 글이 "수정됨"으로 보이면 안 된다.
    // 리비전도 남기지 않는다 — lib/tags/suggest-tags.ts 가 AI 태그를 쓸 때와 같은 방식.
    { timestamps: false },
  );

  return apiSuccess({ postId, closed: true });
}
