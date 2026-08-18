// /api/games/retro/roms/[id]/download — 올린 롬 내려받기 (#194).
//
// 화면에서 다시 받을 방법이 없었다. 기기를 옮기거나 백업하려면 원본을 다시 구해야 했다.
//
// **묶을 것이 없으면 묶지 않는다.** 패치도 부모셋도 없으면 롬을 그대로 흘려보낸다 —
// 쓸데없는 zip 도, 메모리에 통째로 올리는 일도 없다(롬은 최대 50MB).
//
// 묶을 때는 `writeZip`(`public/games/retro/rom-patch.js`)을 **그대로 재사용**한다.
// 플레이어가 패치본을 만들 때 쓰는 바로 그 코드라 결과가 어긋날 일이 없고, 새 zip 작성기를
// 들일 이유도 없다(무압축 저장 방식 — 롬·부모셋은 이미 압축돼 있어 손해가 없다).

import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import * as Minio from 'minio';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import RetroRom from '@/models/retro-rom';
import { activeLeanPatch, isRomId, type LeanPatch } from '@/lib/retro/rom-dto';
import { bundleEntryNames, bundleFileName } from '@/lib/retro/download-bundle';
import { writeZip } from '../../../../../../../../public/games/retro/rom-patch.js';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

/**
 * 묶을 때 메모리에 올리는 총량 상한.
 *
 * 아케이드 부모셋이 17MB 인 사례가 있어 합이 커질 수 있다. 넘으면 **이유를 알려 주고 멈춘다** —
 * 조용히 메모리를 먹다 죽는 것보다 낫다.
 */
const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;

type LeanRom = {
  title: string;
  filename?: string;
  objectKey: string;
  size: number;
  patches?: LeanPatch[];
  patchEnabled?: boolean;
  parentSets?: { name: string; size: number; objectKey: string }[];
};

/** RFC 5987 — 한글 파일명을 헤더에 싣는다. ASCII 폴백은 옛 클라이언트용. */
function disposition(name: string, asciiFallback: string): string {
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function readObject(objectKey: string): Promise<Uint8Array> {
  const stream = await minioClient.getObject(env.minio.bucket, objectKey);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const email = session?.user?.email;
  // 인증 실패도 404 — 401 은 "그 id 는 있다" 는 정보가 된다(기존 파일 라우트와 같은 규칙).
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id } = await ctx.params;
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('title filename objectKey size patches patchEnabled parentSets')
    .lean<LeanRom | null>();
  if (!rom) return new NextResponse('Not Found', { status: 404 });

  // 패치 고르는 규칙은 한 곳에서만 — 화면·넷플레이·다운로드가 다른 패치를 가리키면 안 된다.
  const patch = rom.patchEnabled === false ? undefined : activeLeanPatch(rom);
  const parents = rom.parentSets ?? [];
  const romName = rom.filename || 'rom.bin';

  try {
    // ── 묶을 것이 없으면 원본 그대로.
    if (!patch && !parents.length) {
      const stream = await minioClient.getObject(env.minio.bucket, rom.objectKey);
      const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(rom.size),
          'Content-Disposition': disposition(romName, 'rom.bin'),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const total = rom.size + (patch?.size ?? 0) + parents.reduce((a, p) => a + (p.size ?? 0), 0);
    if (total > MAX_BUNDLE_BYTES) {
      return NextResponse.json(
        { message: `묶기에는 너무 큽니다(${Math.round(total / 1024 / 1024)}MB). 파일을 따로 받아 주세요.` },
        { status: 413 },
      );
    }

    const names = bundleEntryNames({
      romName,
      patchName: patch?.name,
      parentNames: parents.map((p) => p.name),
    });
    const keys = [rom.objectKey, ...(patch ? [patch.objectKey ?? ''] : []), ...parents.map((p) => p.objectKey)];

    const entries = [];
    for (let i = 0; i < keys.length; i++) {
      entries.push({ name: names[i], data: await readObject(keys[i]) });
    }

    const zip = writeZip(entries) as Uint8Array;
    const zipName = bundleFileName(rom.title);
    return new NextResponse(zip as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.length),
        'Content-Disposition': disposition(zipName, 'rom.zip'),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('rom download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
