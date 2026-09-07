// Serving a ROM file (#109) - the authenticated proxy.
//
// The address ends in `<id>.<ext>` (#137). The value is unused, but **EmulatorJS's browser cache key is the last
// segment of the URL**, so it is needed. Every ROM used to end in `.../file`, collapsing the keys into the single
// `file`, so two ROMs of the same byte size could load the wrong game.
// As a bonus, the core's virtual filename gains an extension.
//
// Why the public `/s3/` path is not used: anyone who knows the address could download it. It reads from MinIO and
// streams only for the uploader's own session. The emulator iframe is same-origin, so the cookie is sent.

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
  // A failed authorisation answers 404 too - a 401 would reveal "that id exists".
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id } = await ctx.params;
  // The format is checked first - any old string makes mongoose throw a CastError and return 500.
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('objectKey filename size')
    .lean<{ objectKey: string; filename: string; size: number } | null>();
  if (!rom) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, rom.objectKey);
    // It is not buffered whole - a ROM is up to 50MB (MAX_ROM_BYTES), and loading all of it into memory is costly.
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(rom.size),
        // So a personal file never lands in a shared cache. The browser cache is allowed, making a re-run fast.
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('rom download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
