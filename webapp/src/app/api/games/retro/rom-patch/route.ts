// 롬에 패치 붙이기 (#112).
//
// 롬과 패치는 **따로** 둔다. 합친 결과는 저장하지 않는다 — 합치기는 실행할 때 브라우저가 하고
// (`public/games/retro/rom-patch.js`), 그래서 원본 하나에 패치를 갈아 끼울 수 있다.
//
// 한도가 8MB 라 middleware 본문 제한(10MB) 안에 들어간다 — 롬 업로드와 달리 matcher 에서
// 뺄 필요가 없다.

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
    // 매직만 보면 되므로 앞부분만 넘긴다.
    bytes: new Uint8Array(buf.subarray(0, 16)),
  });
  if (!check.ok) {
    return apiError(check.reason, check.reason.includes('너무 큽니다') ? 413 : 400);
  }

  await connectToDB();
  // 내 롬인지 먼저 본다 — 남의 롬에 패치를 붙일 수 없어야 하고, 없는 롬에 파일만 남으면 곤란하다.
  const owned = await RetroRom.exists({ _id: romId, userEmail: authed.email, isDeleted: { $ne: true } });
  if (!owned) return apiError('롬을 찾을 수 없습니다.', 404);

  const safeName = file.name.replace(/[/\\]/g, '_').slice(0, 200) || 'patch';
  const key = `${KEY_PREFIX}/${randomUUID()}-${safeName}`; // 랜덤 프리픽스 — 키 추측 방지

  try {
    await minioClient.putObject(env.minio.bucket, key, buf);
  } catch (err) {
    console.error('patch upload failed:', err);
    return apiError('패치 업로드에 실패했습니다.', 500);
  }

  try {
    const patch = { name: check.name, format: check.format, size: file.size, objectKey: key };
    const updated = await RetroRom.findOneAndUpdate(
      { _id: romId, userEmail: authed.email, isDeleted: { $ne: true } },
      { $push: { patches: patch } },
      { new: true, projection: { patches: 1 } },
    ).lean<{ patches: LeanPatch[] } | null>();

    const added = updated?.patches?.[updated.patches.length - 1];
    if (!added) throw new Error('패치를 기록하지 못했습니다.');
    return apiSuccess(toPatchDto(added), 201);
  } catch (err) {
    // 기록이 안 됐으면 파일만 남아 아무도 못 찾는 고아가 된다 — 되돌린다.
    console.error('patch record failed, rolling back object:', err);
    try {
      await minioClient.removeObject(env.minio.bucket, key);
    } catch (cleanupErr) {
      console.error('patch rollback failed:', cleanupErr);
    }
    return apiError('패치 정보를 저장하지 못했습니다.', 500);
  }
}
