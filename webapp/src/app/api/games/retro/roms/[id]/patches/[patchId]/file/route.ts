// Serving a patch file (#112) - the same authenticated proxy as the ROM file.
//
// The public `/s3/` path is not used. A patch alone is not a game, but someone else's account's file leaking through
// the address alone is no more acceptable.

import { NextResponse } from 'next/server';
import * as Minio from 'minio';
import { Readable } from 'node:stream';
import { env } from '@/lib/env';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { isRomId, type LeanPatch } from '@/lib/retro/rom-dto';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; patchId: string }> }) {
  const session = await auth();
  const email = session?.user?.email;
  // A failed authorisation is a 404 too - a 401 would reveal "that id exists".
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id, patchId } = await ctx.params;
  if (!isRomId(id) || !isRomId(patchId)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('patches')
    .lean<{ patches: LeanPatch[] } | null>();

  const patch = rom?.patches?.find((p) => String(p._id) === patchId && !p.isDeleted);
  if (!patch?.objectKey) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, patch.objectKey);
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(patch.size),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('patch download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
