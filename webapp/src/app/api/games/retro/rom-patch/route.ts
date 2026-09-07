import { createHash } from 'node:crypto';
// Attaching a patch to a ROM (#112) - **by replacement** (#116).
//
// There is one patch per ROM (handled by one checkbox on the card). Uploading a new one soft-deletes the existing
// one and inserts the new one. The array schema stays, leaving the door open to going back to several later.
//
// The ROM and the patch are kept **separate**. The merged result is never stored - merging happens in the browser at
// run time (`public/games/retro/rom-patch.js`), which is what lets one original have its patch swapped.
//
// The 8MB limit keeps it inside middleware's body limit (10MB) - unlike ROM upload, there is no need to exclude it
// from the matcher.

import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { validatePatchUpload } from '@/lib/retro/patch-upload';
import { isRomId, toPatchDto, type LeanPatch } from '@/lib/retro/rom-dto';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

const KEY_PREFIX = 'retro-patches';

export async function POST(req: NextRequest) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const formData = await req.formData();
  const file = formData.get('file');
  const romId = formData.get('romId');
  if (!file || !(file instanceof File)) return apiError('패치 파일이 없습니다.', 400);
  if (typeof romId !== 'string' || !isRomId(romId)) return apiError('롬을 찾을 수 없습니다.', 404);

  const buf = Buffer.from(await file.arrayBuffer());
  const check = validatePatchUpload({
    filename: file.name,
    size: file.size,
    // Only the magic is needed, so only the head is passed.
    bytes: new Uint8Array(buf.subarray(0, 16)),
  });
  if (!check.ok) {
    return apiError(check.reason, check.reason.includes('너무 큽니다') ? 413 : 400);
  }

  await connectToDB();
  // Ownership is checked first - a patch must not be attachable to someone else's ROM, and a file left against a non-existent ROM is trouble.
  const owned = await RetroRom.exists({ _id: romId, userEmail: authed.email, isDeleted: { $ne: true } });
  if (!owned) return apiError('롬을 찾을 수 없습니다.', 404);

  const safeName = file.name.replace(/[/\\]/g, '_').slice(0, 200) || 'patch';
  const key = `${KEY_PREFIX}/${randomUUID()}-${safeName}`; // A random prefix - it prevents key guessing

  try {
    await minioClient.putObject(env.minio.bucket, key, buf);
  } catch (err) {
    console.error('patch upload failed:', err);
    return apiError('패치 업로드에 실패했습니다.', 500);
  }

  try {
    // The existing patch is folded away first - so at most one entry is ever live.
    await RetroRom.updateOne(
      { _id: romId, userEmail: authed.email, isDeleted: { $ne: true } },
      { $set: { 'patches.$[live].isDeleted': true } },
      { arrayFilters: [{ 'live.isDeleted': { $ne: true } }] },
    );

    // The patch's content is part of the room number too (#188) - a patched and an unpatched side in one room desync.
    const patch = {
      name: check.name, format: check.format, size: file.size, objectKey: key,
      sha256: createHash('sha256').update(buf).digest('hex'),
    };
    const updated = await RetroRom.findOneAndUpdate(
      { _id: romId, userEmail: authed.email, isDeleted: { $ne: true } },
      // Uploading means intending to use it, so applying is turned on as well.
      { $push: { patches: patch }, $set: { patchEnabled: true } },
      { new: true, projection: { patches: 1 } },
    ).lean<{ patches: LeanPatch[] } | null>();

    const added = updated?.patches?.[updated.patches.length - 1];
    if (!added) throw new Error('패치를 기록하지 못했습니다.');
    return apiSuccess(toPatchDto(added), 201);
  } catch (err) {
    // If the record failed, the file is left orphaned where nobody can find it - so it is rolled back.
    console.error('patch record failed, rolling back object:', err);
    try {
      await minioClient.removeObject(env.minio.bucket, key);
    } catch (cleanupErr) {
      console.error('patch rollback failed:', cleanupErr);
    }
    return apiError('패치 정보를 저장하지 못했습니다.', 500);
  }
}
