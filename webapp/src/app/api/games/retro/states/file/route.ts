// Serving a save state's bytes (#114) - the authenticated proxy.
//
// The same principle as ROMs and patches: no public `/s3/` path, streamed only to the owner's own session.

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
  // A failed authorisation is a 404 too - a 401 would reveal "that save exists".
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
        // A save changes often - caching it would mean not loading what was just saved.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('save state download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
