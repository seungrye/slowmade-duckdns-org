// 카드 커버 이미지 — 올리기(POST) · 내려주기(GET) (#122).
//
// 올린 롬은 박스아트가 없어 제목 첫 글자 타일이 전부였다. 직접 그림을 넣게 한다.
//
// 롬·패치와 같은 원칙: 공개 `/s3/` URL 을 만들지 않고 본인 세션일 때만 내려준다.
// 커버는 5MB 라 middleware 본문 제한(10MB) 안이다 — matcher 를 건드리지 않는다.

import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
import { Readable } from 'node:stream';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { isRomId } from '@/lib/retro/rom-dto';
import { validateCoverUpload } from '@/lib/retro/rom-edit';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

const KEY_PREFIX = 'retro-covers';
/** 브라우저에 그대로 넘길 수 있는 형식만 — 이상한 값이 헤더로 새 나가지 않게 한다. */
const SERVABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  if (!isRomId(id)) return apiError('롬을 찾을 수 없습니다.', 404);

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) return apiError('이미지가 없습니다.', 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const check = validateCoverUpload({ size: file.size, bytes: new Uint8Array(buf.subarray(0, 16)) });
  if (!check.ok) {
    return apiError(check.reason, check.reason.includes('너무 큽니다') ? 413 : 400);
  }

  await connectToDB();
  // 내 롬인지 먼저 본다 — 남의 카드를 바꿀 수 없어야 하고, 없는 롬에 파일만 남으면 곤란하다.
  const rom = await RetroRom.findOne({ _id: id, userEmail: authed.email, isDeleted: { $ne: true } })
    .select('coverKey')
    .lean<{ coverKey?: string } | null>();
  if (!rom) return apiError('롬을 찾을 수 없습니다.', 404);

  const key = `${KEY_PREFIX}/${randomUUID()}`;
  try {
    await minioClient.putObject(env.minio.bucket, key, buf, buf.length, {
      'Content-Type': check.format,
    });
  } catch (err) {
    console.error('cover upload failed:', err);
    return apiError('커버를 올리지 못했습니다.', 500);
  }

  try {
    await RetroRom.updateOne(
      { _id: id, userEmail: authed.email, isDeleted: { $ne: true } },
      { $set: { coverKey: key, coverFormat: check.format } },
    );
  } catch (err) {
    console.error('cover record failed, rolling back object:', err);
    try {
      await minioClient.removeObject(env.minio.bucket, key);
    } catch (cleanupErr) {
      console.error('cover rollback failed:', cleanupErr);
    }
    return apiError('커버 정보를 저장하지 못했습니다.', 500);
  }

  // 이전 커버는 지운다 — 롬·패치와 달리 되살릴 이유가 없다. 실패해도 새 커버는 이미 걸렸다.
  if (rom.coverKey) {
    try {
      await minioClient.removeObject(env.minio.bucket, rom.coverKey);
    } catch (err) {
      console.error('old cover cleanup failed:', err);
    }
  }

  // 주소는 그대로이고 내용만 바뀌므로, 클라이언트가 캐시를 깨도록 시각을 함께 준다.
  return apiSuccess({ coverUrl: `/api/games/retro/roms/${id}/cover`, updatedAt: Date.now() });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const email = session?.user?.email;
  // 인증 실패도 404 — 401 은 "그 롬은 있다" 는 정보가 된다.
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id } = await ctx.params;
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('coverKey coverFormat')
    .lean<{ coverKey?: string; coverFormat?: string } | null>();
  if (!rom?.coverKey) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, rom.coverKey);
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': SERVABLE.has(rom.coverFormat ?? '') ? rom.coverFormat! : 'image/png',
        // 개인 파일이라 공유 캐시에 남기지 않는다. 바꾸면 바로 보여야 하므로 재검증도 강제.
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('cover download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
