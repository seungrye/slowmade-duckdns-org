// Serving the parent ROM sets to place alongside the core (#143) - the authenticated proxy.
//
// An arcade split set fetches the parent zip alongside and merges them in the browser (`mergeZips`).
// The address ends in the original name for the same reason as the ROM itself - the cache keys split, and the core reads the name.

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
  // A failed authorisation is a 404 too - a 401 would reveal "that ROM exists".
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id, name } = await ctx.params;
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('parentSets')
    .lean<LeanSets | null>();

  // Only names **in the list** are accepted - so no arbitrary string can pull an object.
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
