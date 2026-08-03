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
import { hydrateCharacterSnapshot } from '@/lib/web-adventure/hydrate-character';
import { enqueueFeedbackNote, capScenePath, capLog } from '@/lib/web-adventure/enqueue-feedback-note';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('로그인이 필요합니다.', 401);
  }

  const body = await req.json();
  if (typeof body.endingId !== 'string' || typeof body.finalSceneId !== 'string') {
    return apiError('endingId, finalSceneId 는 필수입니다.', 400);
  }
  const scenePath = capScenePath(body.scenePath);
  const log = capLog(body.log); // #9 서사 로그 — 피드백 노트 LLM 입력용.

  await connectToDB();
  const save = await WebAdventureSave.findOne({
    userEmail: session.user.email,
  }).lean();
  if (!save) {
    return apiError('진행 중인 save 가 없습니다.', 404);
  }

  // #252 — past_run 적치를 *upsert* 로 변경.
  //   이전 회차에서 save 갱신이 실패했거나 자동저장 race 로 save.runIndex 가
  //   기존 past_run.runIndex 와 동일한 상태에 빠지면, create 방식은 unique
  //   index 충돌(E11000) 로 throw → 400 → save 도 갱신 안 됨 → 새 엔딩이
  //   갤러리에 안 보임. (userEmail, runIndex) 키로 upsert 하면 *마지막 도달*
  //   endingId 가 덮어쓰여 일관 유지.
  let pastRun;
  try {
    pastRun = await WebAdventurePastRun.findOneAndUpdate(
      { userEmail: session.user.email, runIndex: save.runIndex },
      {
        userEmail: session.user.email,
        runIndex: save.runIndex,
        endingId: body.endingId,
        finalSceneId: body.finalSceneId,
        scenePath,
        log,
        // #289 — 옛 save (#287 schema 적용 전) 의 character 호환.
        character: hydrateCharacterSnapshot(save.character),
        completedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
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

  // 3. #9 — 엔딩 시 피드백 노트 자동 생성(큐 적재). 작가 소유, 볼륨 캡·중복 방지.
  await enqueueFeedbackNote(pastRun, session.user.email, log.length);

  return apiSuccess({ nextRunIndex: save.runIndex + 1 });
}
