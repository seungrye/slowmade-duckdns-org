// 세이브스테이트 바이트 내려주기 (#114) — 인증 프록시.
//
// 롬·패치와 같은 원칙: 공개 `/s3/` 경로를 만들지 않고, 본인 세션일 때만 흘려보낸다.

import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
import { Readable } from 'node:stream';
import { env } from '@/lib/env';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import RetroSaveState from '@/models/retro-save-state';
import { canUseGameKey } from '@/lib/retro/save-state-access';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  // 인증 실패도 404 — 401 은 "그 세이브는 있다" 는 정보가 된다.
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const gameKey = new URL(req.url).searchParams.get('game');
  if (!(await canUseGameKey(email, gameKey))) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const doc = await RetroSaveState.findOne({ userEmail: email, gameKey })
    .select('objectKey size')
    .lean<{ objectKey: string; size: number } | null>();
  if (!doc) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, doc.objectKey);
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(doc.size),
        // 세이브는 자주 바뀐다 — 캐시하면 방금 저장한 걸 못 불러온다.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('save state download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
