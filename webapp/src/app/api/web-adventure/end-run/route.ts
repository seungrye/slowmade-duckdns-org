// /api/web-adventure/end-run - ending a run on reaching an ending (#239).
//
// It moves the current save's progress into a past_run, bumps the save's runIndex and resets the character and scene.
// The client calls it on entering EndingScreen. The payload: { endingId, finalSceneId }.
//
// The reset policy: the next run starts from the character-creation screen (creating), so the save's
//   character and currentSceneId are *removed rather than kept*, through mongoose's unset.
//   The save is updated at the next character creation, carrying runIndex over.

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
import { evaluateAndGrant } from '@/lib/achievements';

/**
 * The synthetic account for logged-out web players (#253).
 *
 * It used to return 401 with no session. The client calls this API when logged out too, and it **silently ignored**
 * the 401, so the ending log, path and style were all there and thrown away - no feedback note was created.
 *
 * There is no reason to require a login: the note's **owner is the author** (`env.ownerEmail`), and the player is
 * merely recorded as `sourceUserEmail`. **Feedback from other people's play is the point of the feature.**
 * The app (`app-end-run`) already does the same thing as `app@eternia`, so that approach is followed here.
 */
const WEB_ANON_USER = 'web@eternia';

/**
 * The anonymous submission limit - each request queues an LLM feedback note, which costs money.
 * Finishing a run takes a long time, so normal play never hits this limit.
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
  const log = capLog(body.log); // #9 the narrative log - the LLM input for the feedback note.

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

  // #252 - accumulating the past_run changed to an *upsert*.
  //   When a previous run's save update failed, or an autosave race left save.runIndex equal to the
  //   existing past_run.runIndex, the create approach threw on a unique-index collision (E11000)
  //   -> 400 -> the save was never updated either -> the new ending never appeared in the
  //   gallery. Upserting on the (userEmail, runIndex) key overwrites with *the last reached*
  //   endingId and stays consistent.
  let pastRun;
  try {
    pastRun = await WebAdventurePastRun.findOneAndUpdate(
      { userEmail: session.user.email, runIndex: save.runIndex },
      {
        userEmail: session.user.email,
        runIndex: save.runIndex,
        // #90 - which prose style it was read in is recorded too.
        voice: typeof body.voice === 'string' ? body.voice.slice(0, 32) : '',
        endingId: body.endingId,
        finalSceneId: body.finalSceneId,
        scenePath,
        log,
        // #289 - compatibility with an old save's character (from before the #287 schema).
        character: hydrateCharacterSnapshot(save.character),
        completedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '회차 적치 실패';
    // #352 - quietly returning a response leaves no trace anywhere. When 5 endings were missing from the enum and every
    //   completion was thrown away, the server log was empty and it went unnoticed for over two weeks. A lost run is always logged.
    console.error('[web-adventure] 회차 적치 실패(로그인):', session.user.email, body.endingId, message);
    return apiError(message, 400);
  }

  // Completion is a major axis of the achievements (completion count, ending collection, protagonist collection). Failures are
  // swallowed, so the achievements never block saving a completion.
  await evaluateAndGrant(session.user.email);

  // 2. Bump the save's runIndex - the character and scene are reset (the next run starts from creating).
  await WebAdventureSave.findOneAndUpdate(
    { userEmail: session.user.email },
    {
      runIndex: save.runIndex + 1,
      $unset: { character: '', currentSceneId: '' },
    },
    { new: true },
  );

  // 3. #9 - a feedback note is created automatically on an ending (queued). Owned by the author, with a volume cap and duplicate prevention.
  await enqueueFeedbackNote(pastRun, session.user.email, log.length);

  // 4. #158 - one more scene illustration per ending (queued). The pictures grow as the runs accumulate.
  await enqueueSceneImage(pastRun, session.user.email);

  return apiSuccess({ nextRunIndex: save.runIndex + 1 });
}

/**
 * A logged-out player's ending (#253) - the run is accumulated on the synthetic account and a feedback note queued.
 *
 * **The server save is left alone.** A logged-out player has no server save, and the client already manages the
 * progress in localStorage (bumping runIndex and clearing the character on an ending itself).
 *
 * No scene illustration is queued - each run costs an image generation, and what is being fixed here is the feedback
 * note. It differs from the app path, so changing it is a separate decision.
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

  // Every anonymous play gathers on one account, so runIndex collides - it recounts and retries.
  // (The same approach as app-end-run. At this volume, count+1 is enough.)
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
        // The character the client sent. Without it, hydrate fills in defaults, but the note's narrative would then
        // diverge from the actual play, so the client sends it along.
        character: hydrateCharacterSnapshot(body.character),
        completedAt: new Date(),
      });
      break;
    } catch (err) {
      const dup = err instanceof Error && err.message.includes('E11000');
      if (dup && attempt < 2) continue;
      const message = err instanceof Error ? err.message : '회차 적치 실패';
      // #352 - always logged, for the reason above. A logged-out player has not even a save to fall back on, so missing it
      //   here loses that run forever.
      console.error('[web-adventure] 회차 적치 실패(비로그인):', body.endingId, message);
      return apiError(message, 500);
    }
  }

  await enqueueFeedbackNote(pastRun, 'web', log.length);

  return apiSuccess({ ok: true });
}
