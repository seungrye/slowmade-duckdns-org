// /api/web-adventure/app-end-run - the Android app's (login-free) ending submission -> an AI feedback note. (#33)
//
// The app has no next-auth session and no server save, so it cannot use end-run. Instead it authenticates with a
// shared app key (x-app-key), and a synthetic user's (app@eternia) past-run is created to queue a feedback note.
// The note belongs to the author (the owner), with sourceUserEmail='app'. The app is cross-origin, so CORS is needed.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { hydrateCharacterSnapshot } from '@/lib/web-adventure/hydrate-character';
import { enqueueFeedbackNote, capScenePath, capLog } from '@/lib/web-adventure/enqueue-feedback-note';
import { enqueueSceneImage } from '@/lib/web-adventure/enqueue-scene-image';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const APP_USER = 'app@eternia'; // The synthetic account for anonymous players from the app.

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-app-key',
};
function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}
function json(body: unknown, status: number): NextResponse {
  return withCors(NextResponse.json(body, { status }));
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const key = env.appKey.trim();
  if (!key) return json({ message: 'app 제출 비활성(APP_KEY 미설정)' }, 503);
  if (req.headers.get('x-app-key') !== key) return json({ message: 'unauthorized' }, 401);

  // Every request queues an LLM feedback note plus an image generation - both cost money (#177).
  // The only authentication is one static key embedded in the app, so extracting it from the APK would allow unlimited runs.
  // Normal play takes a long time to finish a run, so this limit is never hit.
  if (!rateLimit(`app-end-run:${clientIp(req)}`, 10, 60 * 60_000)) {
    return json({ message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, 429);
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.endingId !== 'string' || typeof body.finalSceneId !== 'string') {
    return json({ message: 'endingId, finalSceneId 는 필수입니다.' }, 400);
  }
  const scenePath = capScenePath(body.scenePath);
  const log = capLog(body.log);
  // The app's retry queue (#61) can resend the same run. An idempotency key prevents duplicate accumulation. (#63)
  const clientRunId = typeof body.clientRunId === 'string' ? body.clientRunId.slice(0, 64) : '';

  await connectToDB();

  if (clientRunId) {
    const already = await WebAdventurePastRun.findOne({ userEmail: APP_USER, clientRunId });
    if (already) return json({ ok: true, duplicate: true }, 200);
  }

  // Creates the synthetic user's past-run. runIndex is count+1 (low volume), retried by recounting on a concurrency collision.
  let pastRun = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const count = await WebAdventurePastRun.countDocuments({ userEmail: APP_USER });
    try {
      pastRun = await WebAdventurePastRun.create({
        userEmail: APP_USER,
        runIndex: count + 1,
        // #90 - which prose style it was read in is recorded too.
        voice: typeof body.voice === 'string' ? body.voice.slice(0, 32) : '',
        endingId: body.endingId,
        finalSceneId: body.finalSceneId,
        scenePath,
        log,
        character: hydrateCharacterSnapshot(body.character),
        clientRunId,
        completedAt: new Date(),
      });
      break;
    } catch (err) {
      const dup = err instanceof Error && err.message.includes('E11000');
      // Another request inserted the same run between the query and the save - treated as a duplicate.
      if (dup && clientRunId) {
        const raced = await WebAdventurePastRun.findOne({ userEmail: APP_USER, clientRunId });
        if (raced) return json({ ok: true, duplicate: true }, 200);
      }
      if (dup && attempt < 2) continue; // A runIndex collision -> recount and retry.
      const message = err instanceof Error ? err.message : '회차 적치 실패';
      return json({ message }, 500);
    }
  }

  // Queues the feedback note (owned by the author, sourceUserEmail='app', with the volume cap, duplicate prevention, and only when there is a log).
  await enqueueFeedbackNote(pastRun, 'app', log.length);

  // #158 - one more scene illustration per ending (queued). An app run grows the pictures too.
  await enqueueSceneImage(pastRun, 'app');

  return json({ ok: true }, 200);
}
