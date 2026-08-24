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
import { enqueueSceneImage } from '@/lib/web-adventure/enqueue-scene-image';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * 비로그인 웹 플레이어의 합성 계정 (#253).
 *
 * 예전엔 세션이 없으면 401 이었다. 클라이언트는 비로그인일 때도 이 API 를 부르는데 401 을
 * **조용히 무시**해서, 엔딩 로그·경로·문체가 전부 있는데도 버려졌다 — 피드백 노트가 안 생겼다.
 *
 * 로그인을 요구할 이유가 없다: 노트의 **소유자는 작가**(`env.ownerEmail`)고, 플레이어는
 * `sourceUserEmail` 로 기록될 뿐이다. 오히려 **남의 플레이 피드백이 이 기능의 목적**이다.
 * 앱(`app-end-run`)이 `app@eternia` 로 이미 같은 일을 하고 있어 그 방식을 그대로 따른다.
 */
const WEB_ANON_USER = 'web@eternia';

/**
 * 익명 제출 한도 — 요청 1건이 LLM 피드백 노트를 큐에 넣으므로 돈이 든다.
 * 한 회차를 끝내는 데 한참 걸리므로 정상 플레이는 이 한도에 걸릴 일이 없다.
 */
const ANON_LIMIT = 10;
const ANON_WINDOW_MS = 60 * 60_000;

export async function POST(req: NextRequest) {
  const session = await auth();

  const body = await req.json().catch(() => ({}));
  if (typeof body.endingId !== 'string' || typeof body.finalSceneId !== 'string') {
    return apiError('endingId, finalSceneId 는 필수입니다.', 400);
  }
  const scenePath = capScenePath(body.scenePath);
  const log = capLog(body.log); // #9 서사 로그 — 피드백 노트 LLM 입력용.

  if (!session?.user?.email) {
    return endAnonymousRun(req, body, scenePath, log);
  }

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
        // #90 — 어떤 문체로 읽었는지 함께 남긴다.
        voice: typeof body.voice === 'string' ? body.voice.slice(0, 32) : '',
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

  // 4. #158 — 엔딩마다 씬 삽화 한 장 추가(큐 적재). 회차를 거듭할수록 그림이 늘어난다.
  await enqueueSceneImage(pastRun, session.user.email);

  return apiSuccess({ nextRunIndex: save.runIndex + 1 });
}

/**
 * 비로그인 플레이어의 엔딩 (#253) — 회차를 합성 계정에 적치하고 피드백 노트를 큐에 올린다.
 *
 * **서버 save 는 건드리지 않는다.** 비로그인은 서버 save 자체가 없고, 진행도는 클라이언트가
 * localStorage 로 이미 관리한다(엔딩 시 runIndex+1·캐릭터 clear 를 클라이언트가 한다).
 *
 * 씬 삽화는 올리지 않는다 — 회차마다 이미지 생성 비용이 들고, 여기서 고치려는 것은 피드백
 * 노트다. 앱 경로와 다른 점이므로 바꾸려면 따로 결정할 일이다.
 */
async function endAnonymousRun(
  req: NextRequest,
  body: { endingId: string; finalSceneId: string; voice?: unknown; character?: unknown },
  scenePath: string[],
  log: string[],
) {
  if (!rateLimit(`end-run-anon:${clientIp(req)}`, ANON_LIMIT, ANON_WINDOW_MS)) {
    return apiError('요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.', 429);
  }

  await connectToDB();

  // 익명 플레이가 전부 한 계정에 모이므로 runIndex 가 부딪힌다 — 다시 세어 재시도한다.
  // (app-end-run 과 같은 방식. 저볼륨이라 count+1 로 충분하다.)
  let pastRun = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const count = await WebAdventurePastRun.countDocuments({ userEmail: WEB_ANON_USER });
    try {
      pastRun = await WebAdventurePastRun.create({
        userEmail: WEB_ANON_USER,
        runIndex: count + 1,
        voice: typeof body.voice === 'string' ? body.voice.slice(0, 32) : '',
        endingId: body.endingId,
        finalSceneId: body.finalSceneId,
        scenePath,
        log,
        // 클라이언트가 보낸 캐릭터. 없으면 hydrate 가 기본값으로 채우지만, 그러면 노트
        // 서사가 실제 플레이와 어긋나므로 클라이언트가 함께 보낸다.
        character: hydrateCharacterSnapshot(body.character),
        completedAt: new Date(),
      });
      break;
    } catch (err) {
      const dup = err instanceof Error && err.message.includes('E11000');
      if (dup && attempt < 2) continue;
      const message = err instanceof Error ? err.message : '회차 적치 실패';
      return apiError(message, 500);
    }
  }

  await enqueueFeedbackNote(pastRun, 'web', log.length);

  return apiSuccess({ ok: true });
}
