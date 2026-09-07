// Serving the screen at the moment of saving (the thumbnail) (#114).
//
// EmulatorJS provides a screenshot with the saveState event. A picture in the list identifies "when this was saved"
// faster than a date does.

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
        // The format follows what EmulatorJS gave, but through a whitelist so no odd value leaks into a header.
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
