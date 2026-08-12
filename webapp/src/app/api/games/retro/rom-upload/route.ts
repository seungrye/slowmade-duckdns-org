// 롬 올리기 (#109).
//
// 목록(`../roms`)과 **경로를 나눈 이유**: 이 라우트는 `src/middleware.ts` 의 matcher 에서 빠져야
// 한다. middleware 가 매칭되면 Next 가 요청 본문을 버퍼링하며 기본 10MB 로 제한해 큰 롬이 잘린다.
// 그런데 접두사로 빼면 `roms/[id]/file`(내려받기)까지 딸려 빠져 보안 헤더가 사라진다. 그래서
// 업로드만 다른 경로에 둔다 — `api/attachment/upload` 가 같은 이유로 분리돼 있다.
//
// 올린 롬은 **올린 사람만** 보고 실행할 수 있다. 공개 `/s3/` URL 을 만들지 않고, 파일은
// `roms/[id]/file` 인증 프록시로만 내려준다.

import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { isOwner } from '@/lib/require-owner';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { validateRomUpload } from '@/lib/retro/rom-upload';
import { toRomDto, type LeanRom } from '@/lib/retro/rom-dto';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

const KEY_PREFIX = 'retro-roms';

export async function POST(req: NextRequest) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) return apiError('롬 파일이 없습니다.', 400);

  const platform = formData.get('platform');
  const owner = await isOwner();

  const check = validateRomUpload({
    filename: file.name,
    size: file.size,
    platform: typeof platform === 'string' && platform ? platform : undefined,
    isOwner: owner,
  });
  if (!check.ok) {
    // 크기 초과만 413 — nginx·브라우저가 내는 413 과 의미를 맞춰 클라이언트가 한 갈래로 처리한다.
    return apiError(check.reason, check.reason.includes('너무 큽니다') ? 413 : 400);
  }

  const safeName = file.name.replace(/[/\\]/g, '_').slice(0, 200) || 'rom';
  const key = `${KEY_PREFIX}/${randomUUID()}-${safeName}`; // 랜덤 프리픽스 — 키 추측 방지

  try {
    await minioClient.putObject(env.minio.bucket, key, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error('rom upload failed:', err);
    return apiError('롬 업로드에 실패했습니다.', 500);
  }

  try {
    await connectToDB();
    const doc = await RetroRom.create({
      userEmail: authed.email,
      title: check.title,
      platform: check.platform,
      core: check.core,
      filename: safeName,
      size: file.size,
      objectKey: key,
    });
    return apiSuccess(toRomDto(doc as unknown as LeanRom), 201);
  } catch (err) {
    // 기록이 안 됐으면 파일만 남아 아무도 못 찾는 고아가 된다 — 되돌린다.
    console.error('rom record failed, rolling back object:', err);
    try {
      await minioClient.removeObject(env.minio.bucket, key);
    } catch (cleanupErr) {
      console.error('rom rollback failed:', cleanupErr);
    }
    return apiError('롬 정보를 저장하지 못했습니다.', 500);
  }
}
