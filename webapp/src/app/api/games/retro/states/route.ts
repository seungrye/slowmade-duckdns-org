// 서버 세이브스테이트 — 저장(PUT) · 메타 조회(GET) · 삭제(DELETE) (#114).
//
// EmulatorJS 의 네이티브 Save/Load 버튼이 `EJS_onSaveState`/`EJS_onLoadState` 를 통해 여기로
// 온다(`public/games/retro/player.html`). 새 UI 를 만들지 않고 저장 위치만 서버로 돌린 것이다.
//
// `gameKey` 에 `:` 가 들어가므로 경로가 아니라 **쿼리**로 받는다.

import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import RetroSaveState from '@/models/retro-save-state';
import { MAX_STATE_BYTES, canUseGameKey } from '@/lib/retro/save-state-access';
import { evaluateAndGrant } from '@/lib/achievements';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

const KEY_PREFIX = 'retro-states';

type LeanState = { size: number; shotKey?: string; updatedAt?: Date };

export async function GET(req: NextRequest) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const gameKey = new URL(req.url).searchParams.get('game');
  if (!(await canUseGameKey(authed.email, gameKey))) return apiError('찾을 수 없습니다.', 404);

  await connectToDB();
  const doc = await RetroSaveState.findOne({ userEmail: authed.email, gameKey })
    .select('size shotKey updatedAt')
    .lean<LeanState | null>();

  // 없는 것은 오류가 아니다 — 아직 저장 안 했을 뿐이다.
  if (!doc) return apiSuccess(null);
  return apiSuccess({
    size: doc.size,
    hasShot: Boolean(doc.shotKey),
    updatedAt: (doc.updatedAt ?? new Date(0)).toISOString(),
  });
}

export async function PUT(req: NextRequest) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const formData = await req.formData();
  const gameKey = formData.get('game');
  const state = formData.get('state');
  const shot = formData.get('shot');

  if (typeof gameKey !== 'string' || !(await canUseGameKey(authed.email, gameKey))) {
    return apiError('찾을 수 없습니다.', 404);
  }
  if (!(state instanceof File) || state.size <= 0) return apiError('저장할 상태가 없습니다.', 400);
  if (state.size > MAX_STATE_BYTES) {
    return apiError(`상태가 너무 큽니다 (최대 ${Math.floor(MAX_STATE_BYTES / (1024 * 1024))}MB).`, 413);
  }

  // 키에 uuid 를 넣어 매번 새 오브젝트로 쓴다 — 덮어쓰기 중 실패해도 이전 것이 온전하다.
  const stateKey = `${KEY_PREFIX}/${randomUUID()}.state`;
  let shotKey: string | undefined;

  try {
    await minioClient.putObject(env.minio.bucket, stateKey, Buffer.from(await state.arrayBuffer()));
    if (shot instanceof File && shot.size > 0 && shot.size <= MAX_STATE_BYTES) {
      shotKey = `${KEY_PREFIX}/${randomUUID()}.shot`;
      await minioClient.putObject(env.minio.bucket, shotKey, Buffer.from(await shot.arrayBuffer()));
    }
  } catch (err) {
    console.error('save state upload failed:', err);
    return apiError('세이브를 저장하지 못했습니다.', 500);
  }

  try {
    await connectToDB();
    await RetroSaveState.updateOne(
      { userEmail: authed.email, gameKey },
      {
        $set: {
          size: state.size,
          objectKey: stateKey,
          shotKey,
          shotFormat: shot instanceof File ? shot.type || 'image/png' : undefined,
        },
      },
      { upsert: true },
    );
    await evaluateAndGrant(authed.email);
    return apiSuccess({ size: state.size });
  } catch (err) {
    console.error('save state record failed, rolling back object:', err);
    for (const key of [stateKey, shotKey]) {
      if (!key) continue;
      try {
        await minioClient.removeObject(env.minio.bucket, key);
      } catch (cleanupErr) {
        console.error('save state rollback failed:', cleanupErr);
      }
    }
    return apiError('세이브 정보를 저장하지 못했습니다.', 500);
  }
}

export async function DELETE(req: NextRequest) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const gameKey = new URL(req.url).searchParams.get('game');
  if (!(await canUseGameKey(authed.email, gameKey))) return apiError('찾을 수 없습니다.', 404);

  await connectToDB();
  // 여기만 진짜 삭제다 — 플래그를 세우면 같은 (user, game) 로 다시 저장할 때 유니크
  // 인덱스와 부딪힌다. MinIO 오브젝트는 남겨 되살릴 여지를 둔다.
  const res = await RetroSaveState.deleteOne({ userEmail: authed.email, gameKey });
  if (!res.deletedCount) return apiError('저장된 세이브가 없습니다.', 404);
  return apiSuccess({ deleted: true });
}
