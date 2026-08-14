// /api/web-adventure/scene-images/worker — 씬 삽화 큐 워커 (#158).
//
// 한 번 호출될 때마다 큐에서 **한 개**만 처리한다. host cron 이 주기적으로 호출해 드레인한다.
// 구조는 피드백 노트 워커(#9)와 같다 — stale 복구 → 순차 보장 → 원자적 claim → 생성 → 반영.
//
// 인증: 내부 키(x-worker-key = env.llmWorkerKey) 또는 owner 세션. 그 외 404.
//
// 생성은 painter 와 같은 경로를 탄다: 한글 프롬프트 → Gemini 영역 → Pollinations(flux) →
// MinIO 저장. 성공하면 그 씬의 `illustrations[]` 에 **바로** 더한다(작가 승인 단계 없음).

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { apiSuccess } from '@/lib/api-response';
import { env } from '@/lib/env';
import { getMinioClient } from '@/lib/minio-client';
import { translateAndGenerate } from '@/lib/painter/imageGen';
import WebAdventureSceneImage from '@/models/web-adventure-scene-image';
import WebAdventureScene from '@/models/web-adventure-scene';

const MAX_ATTEMPTS = 3;
/** 이 시간 넘게 processing 이면 배포 등으로 끊긴 것으로 본다. */
const STALE_MS = 10 * 60 * 1000;

// 이미지 생성은 수십 초 걸린다. 넉넉히 둔다(nginx 를 우회해 직접 호출되므로 안전).
export const maxDuration = 300;

async function authorize(req: NextRequest): Promise<boolean> {
  const key = env.llmWorkerKey.trim();
  if (key && req.headers.get('x-worker-key') === key) return true;
  const owner = await requireOwner();
  return !(owner instanceof NextResponse);
}

export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  await connectToDB();

  // 1) stale 복구 — 결과를 기록하지 못한 시도는 시도로 치지 않는다(피드백 워커 #101 과 같은 이유).
  await WebAdventureSceneImage.updateMany(
    { status: 'processing', claimedAt: { $lt: new Date(Date.now() - STALE_MS) }, attempts: { $gt: 0 } },
    { $set: { status: 'queued', claimedAt: null }, $inc: { attempts: -1 } },
  );

  // 2) 순차 보장 — 살아있는 processing 있으면 skip.
  if ((await WebAdventureSceneImage.countDocuments({ status: 'processing' })) > 0) {
    return apiSuccess({ state: 'busy' });
  }

  // 3) 가장 오래된 queued 를 원자적으로 claim.
  const item = await WebAdventureSceneImage.findOneAndUpdate(
    { status: 'queued' },
    { status: 'processing', claimedAt: new Date(), $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  );
  if (!item) return apiSuccess({ state: 'idle' });

  try {
    if (!item.prompt) throw new Error('프롬프트가 비어 있습니다.');

    const result = await translateAndGenerate(item.prompt, {
      minioClient: getMinioClient(),
      bucket: env.minio.bucket,
      endpoint: env.minio.publicHost,
      geminiApiKey: env.geminiApiKey,
    });

    // 씬에 바로 더한다. $addToSet 이라 같은 주소가 두 번 들어가지 않는다.
    const updated = await WebAdventureScene.updateOne(
      { id: item.sceneId, isDeleted: { $ne: true } },
      { $addToSet: { illustrations: result.url } },
    );
    if (updated.matchedCount === 0) throw new Error(`씬을 찾을 수 없습니다: ${item.sceneId}`);

    item.url = result.url;
    item.objectKey = result.key;
    item.status = 'ready';
    item.error = '';
    item.claimedAt = null;
    await item.save();
    return apiSuccess({ state: 'done', sceneId: item.sceneId, url: result.url });
  } catch (err) {
    const message = (err instanceof Error ? err.message : '생성 실패').slice(0, 500);
    if (item.attempts >= MAX_ATTEMPTS) {
      item.status = 'failed';
      item.error = message;
    } else {
      item.status = 'queued';
      item.error = message;
    }
    item.claimedAt = null;
    await item.save();
    return apiSuccess({ state: item.status, error: message });
  }
}
