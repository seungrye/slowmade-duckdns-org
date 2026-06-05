// /api/web-adventure/end-run — 엔딩 도달 시 회차 종결 (#239).
//
// 현재 save 의 진행도를 past_run 으로 옮기고 save 의 runIndex+1 + 캐릭터/씬 reset.
// 클라이언트가 EndingScreen 진입 시 호출. payload: { endingId, finalSceneId }.
//
// reset 정책: 다음 회차는 캐릭터 생성 화면(creating) 부터 시작이므로 save 의
//   character/currentSceneId 는 *유지하지 않고 제거*. mongoose 의 unset 으로 처리.
//   다음 캐릭터 생성 시 save 가 갱신되며 runIndex 가 인계.

import { NextRequest } from 'next/server';
import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import WebAdventureSave from '@/models/web-adventure-save';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('로그인이 필요합니다.', 401);
  }

  const body = await req.json();
  if (typeof body.endingId !== 'string' || typeof body.finalSceneId !== 'string') {
    return apiError('endingId, finalSceneId 는 필수입니다.', 400);
  }

  await connectToDB();
  const save = await WebAdventureSave.findOne({
    userEmail: session.user.email,
  }).lean();
  if (!save) {
    return apiError('진행 중인 save 가 없습니다.', 404);
  }

  // 1. past_run 적치 (같은 runIndex 가 이미 있으면 unique index 충돌 → 409).
  try {
    await WebAdventurePastRun.create({
      userEmail: session.user.email,
      runIndex: save.runIndex,
      endingId: body.endingId,
      finalSceneId: body.finalSceneId,
      character: save.character,
      completedAt: new Date(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '회차 적치 실패';
    return apiError(message, 400);
  }

  // 2. save 의 runIndex+1 — 캐릭터/씬은 reset (다음 회차는 creating 부터).
  await WebAdventureSave.findOneAndUpdate(
    { userEmail: session.user.email },
    {
      runIndex: save.runIndex + 1,
      $unset: { character: '', currentSceneId: '' },
    },
    { new: true },
  );

  return apiSuccess({ nextRunIndex: save.runIndex + 1 });
}
