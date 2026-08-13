// 코어에 함께 놓을 부모 롬셋 내려주기 (#143) — 인증 프록시.
//
// 아케이드 분할 셋은 부모 zip 을 함께 받아 브라우저에서 합친다(`mergeZips`).
// 주소 끝이 원본 이름인 이유는 롬 본체와 같다 — 캐시 키가 갈리고, 코어가 이름을 본다.

import { NextResponse } from 'next/server';
import * as Minio from 'minio';
import { Readable } from 'node:stream';
import { env } from '@/lib/env';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { isRomId } from '@/lib/retro/rom-dto';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

type LeanSets = { parentSets?: { name: string; size: number; objectKey: string }[] };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; name: string }> }) {
  const session = await auth();
  const email = session?.user?.email;
  // 인증 실패도 404 — 401 은 "그 롬은 있다" 는 정보가 된다.
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id, name } = await ctx.params;
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('parentSets')
    .lean<LeanSets | null>();

  // 이름은 목록에 **있는 것만** 받는다 — 임의 문자열로 오브젝트를 집어가지 못하게.
  const set = rom?.parentSets?.find((p) => p.name === decodeURIComponent(name));
  if (!set) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, set.objectKey);
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(set.size),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('parent set download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
