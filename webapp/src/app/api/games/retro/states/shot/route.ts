// 세이브 순간의 화면(썸네일) 내려주기 (#114).
//
// EmulatorJS 가 saveState 이벤트에 스크린샷을 함께 준다. 목록에 그림이 있으면 "언제 저장한
// 것인지" 를 날짜보다 빨리 알아본다.

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
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const gameKey = new URL(req.url).searchParams.get('game');
  if (!(await canUseGameKey(email, gameKey))) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const doc = await RetroSaveState.findOne({ userEmail: email, gameKey })
    .select('shotKey shotFormat')
    .lean<{ shotKey?: string; shotFormat?: string } | null>();
  if (!doc?.shotKey) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, doc.shotKey);
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        // 형식은 EmulatorJS 가 준 값을 따르되, 이상한 값이 헤더로 새 나가지 않게 화이트리스트.
        'Content-Type': doc.shotFormat === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('save state shot download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
