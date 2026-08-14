// /api/web-adventure/app-end-run — 안드로이드 앱(로그인 없음) 엔딩 제출 → AI 피드백 노트. (#33)
//
// 앱은 next-auth 세션·서버 save 가 없어 end-run 을 못 쓴다. 대신 공유 앱 키(x-app-key)로
// 인증하고, 합성 사용자(app@eternia) past-run 을 만들어 피드백 노트를 큐에 적재한다.
// 노트 소유는 작가(owner), sourceUserEmail='app'. 앱은 cross-origin 이라 CORS 필요.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { hydrateCharacterSnapshot } from '@/lib/web-adventure/hydrate-character';
import { enqueueFeedbackNote, capScenePath, capLog } from '@/lib/web-adventure/enqueue-feedback-note';
import { enqueueSceneImage } from '@/lib/web-adventure/enqueue-scene-image';

const APP_USER = 'app@eternia'; // 앱발 익명 플레이어 합성 계정.

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

  const body = await req.json().catch(() => ({}));
  if (typeof body.endingId !== 'string' || typeof body.finalSceneId !== 'string') {
    return json({ message: 'endingId, finalSceneId 는 필수입니다.' }, 400);
  }
  const scenePath = capScenePath(body.scenePath);
  const log = capLog(body.log);
  // 앱 재시도 큐(#61)가 같은 회차를 다시 보낼 수 있다. 멱등 키로 중복 적치를 막는다. (#63)
  const clientRunId = typeof body.clientRunId === 'string' ? body.clientRunId.slice(0, 64) : '';

  await connectToDB();

  if (clientRunId) {
    const already = await WebAdventurePastRun.findOne({ userEmail: APP_USER, clientRunId });
    if (already) return json({ ok: true, duplicate: true }, 200);
  }

  // 합성 사용자 past-run 생성. runIndex 는 count+1(저볼륨), 동시성 충돌 시 재count 재시도.
  let pastRun = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const count = await WebAdventurePastRun.countDocuments({ userEmail: APP_USER });
    try {
      pastRun = await WebAdventurePastRun.create({
        userEmail: APP_USER,
        runIndex: count + 1,
        // #90 — 어떤 문체로 읽었는지 함께 남긴다.
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
      // 조회 후 저장 사이에 다른 요청이 같은 회차를 먼저 넣은 경우 — 중복으로 본다.
      if (dup && clientRunId) {
        const raced = await WebAdventurePastRun.findOne({ userEmail: APP_USER, clientRunId });
        if (raced) return json({ ok: true, duplicate: true }, 200);
      }
      if (dup && attempt < 2) continue; // runIndex 충돌 → 재count 후 재시도.
      const message = err instanceof Error ? err.message : '회차 적치 실패';
      return json({ message }, 500);
    }
  }

  // 피드백 노트 큐 적재(작가 소유, sourceUserEmail='app', 볼륨 캡·중복 방지·로그 있을 때만).
  await enqueueFeedbackNote(pastRun, 'app', log.length);

  // #158 — 엔딩마다 씬 삽화 한 장 추가(큐 적재). 앱 회차도 그림을 늘린다.
  await enqueueSceneImage(pastRun, 'app');

  return json({ ok: true }, 200);
}
