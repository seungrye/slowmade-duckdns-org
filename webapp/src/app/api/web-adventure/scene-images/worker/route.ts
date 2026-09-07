// /api/web-adventure/scene-images/worker - the scene illustration queue worker (#158).
//
// Each call processes **one** item from the queue. A host cron calls it periodically to drain it.
// The structure matches the feedback-note worker (#9) - stale recovery, sequential ordering, an atomic claim, generation, then applying it.
//
// Authentication: an internal key (x-worker-key = env.llmWorkerKey) or an owner session. Anything else gets 404.
//
// Generation takes the same path as painter: a Korean prompt -> Gemini translation -> Pollinations (flux) ->
// stored in MinIO. On success it is added **straight** to that scene's `illustrations[]` (with no author approval step).

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
/** Processing for longer than this is taken as cut off by a deploy or the like. */
const STALE_MS = 10 * 60 * 1000;

// Image generation takes tens of seconds. It is generous (safe, since it is called directly, bypassing nginx).
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

  // 1) Stale recovery - an attempt that never recorded its outcome does not count as an attempt (the same reason as the feedback worker's #101).
  await WebAdventureSceneImage.updateMany(
    { status: 'processing', claimedAt: { $lt: new Date(Date.now() - STALE_MS) }, attempts: { $gt: 0 } },
    { $set: { status: 'queued', claimedAt: null }, $inc: { attempts: -1 } },
  );

  // 2) Guaranteeing order - skipped while a live processing item exists.
  if ((await WebAdventureSceneImage.countDocuments({ status: 'processing' })) > 0) {
    return apiSuccess({ state: 'busy' });
  }

  // 3) Atomically claim the oldest queued item.
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

    // Added straight to the scene. Being $addToSet, the same address never goes in twice.
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
