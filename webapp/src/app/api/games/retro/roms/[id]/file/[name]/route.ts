// 롬 파일 내려주기 (#109) — 인증 프록시.
//
// 주소 끝에 `<id>.<확장자>` 가 붙는다 (#137). 값은 쓰지 않지만 **EmulatorJS 의 브라우저 캐시
// 키가 URL 의 마지막 조각**이라 필요하다. 예전엔 모든 롬이 `.../file` 로 끝나 키가 `file` 하나로
// 겹쳤고, 바이트 크기가 같은 두 롬이 있으면 엉뚱한 게임이 뜰 수 있었다.
// 덤으로 코어의 가상 파일명에도 확장자가 생긴다.
//
// 공개 `/s3/` 경로를 쓰지 않는 이유: 주소만 알면 누구나 받아 갈 수 있기 때문이다. 올린 사람
// 본인 세션일 때만 MinIO 에서 읽어 흘려보낸다. 에뮬레이터 iframe 도 같은 출처라 쿠키가 실린다.

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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; name: string }> }) {
  const session = await auth();
  const email = session?.user?.email;
  // 인증 실패도 404 로 답한다 — 401 은 "그 id 는 있다" 는 정보가 된다.
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id } = await ctx.params;
  // 형식부터 본다 — 아무 문자열이나 넘기면 mongoose 가 CastError 로 500 을 낸다.
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('objectKey filename size')
    .lean<{ objectKey: string; filename: string; size: number } | null>();
  if (!rom) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, rom.objectKey);
    // 통째로 버퍼링하지 않는다 — 롬은 최대 50MB(MAX_ROM_BYTES) 라 메모리에 다 올리면 부담이 크다.
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(rom.size),
        // 개인 파일이 공유 캐시에 남지 않게. 브라우저 캐시는 허용해 재실행이 빠르다.
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('rom download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
