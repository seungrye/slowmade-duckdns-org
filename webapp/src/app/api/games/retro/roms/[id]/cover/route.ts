// The card's cover image - upload (POST) and serve (GET) (#122).
//
// An uploaded ROM has no box art, so a tile of the title's first character was all there was. This lets a picture be added.
//
// The same principle as ROMs and patches: no public `/s3/` URL, served only to the owner's own session.
// At 5MB a cover stays inside middleware's body limit (10MB) - the matcher is untouched.

import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
import { Readable } from 'node:stream';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { isRomId } from '@/lib/retro/rom-dto';
import { validateCoverUpload } from '@/lib/retro/rom-edit';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

const KEY_PREFIX = 'retro-covers';
/** Only formats the browser can draw as they are - so no odd value leaks into a header. */
const SERVABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  if (!isRomId(id)) return apiError('롬을 찾을 수 없습니다.', 404);

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) return apiError('이미지가 없습니다.', 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const check = validateCoverUpload({ size: file.size, bytes: new Uint8Array(buf.subarray(0, 16)) });
  if (!check.ok) {
    return apiError(check.reason, check.reason.includes('너무 큽니다') ? 413 : 400);
  }

  await connectToDB();
  // Ownership is checked first - someone else's card must not be changeable, and a file left against a non-existent ROM is trouble.
  const rom = await RetroRom.findOne({ _id: id, userEmail: authed.email, isDeleted: { $ne: true } })
    .select('coverKey')
    .lean<{ coverKey?: string } | null>();
  if (!rom) return apiError('롬을 찾을 수 없습니다.', 404);

  const key = `${KEY_PREFIX}/${randomUUID()}`;
  try {
    await minioClient.putObject(env.minio.bucket, key, buf, buf.length, {
      'Content-Type': check.format,
    });
  } catch (err) {
    console.error('cover upload failed:', err);
    return apiError('커버를 올리지 못했습니다.', 500);
  }

  try {
    await RetroRom.updateOne(
      { _id: id, userEmail: authed.email, isDeleted: { $ne: true } },
      { $set: { coverKey: key, coverFormat: check.format } },
    );
  } catch (err) {
    console.error('cover record failed, rolling back object:', err);
    try {
      await minioClient.removeObject(env.minio.bucket, key);
    } catch (cleanupErr) {
      console.error('cover rollback failed:', cleanupErr);
    }
    return apiError('커버 정보를 저장하지 못했습니다.', 500);
  }

  // The previous cover is deleted - unlike ROMs and patches there is no reason to restore it. Even on failure the new cover is already in place.
  if (rom.coverKey) {
    try {
      await minioClient.removeObject(env.minio.bucket, rom.coverKey);
    } catch (err) {
      console.error('old cover cleanup failed:', err);
    }
  }

  // The address stays the same while the content changes, so a timestamp is sent along for the client to break its cache.
  return apiSuccess({ coverUrl: `/api/games/retro/roms/${id}/cover`, updatedAt: Date.now() });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const email = session?.user?.email;
  // A failed authorisation is a 404 too - a 401 would reveal "that ROM exists".
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id } = await ctx.params;
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('coverKey coverFormat')
    .lean<{ coverKey?: string; coverFormat?: string } | null>();
  if (!rom?.coverKey) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, rom.coverKey);
    const body = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        'Content-Type': SERVABLE.has(rom.coverFormat ?? '') ? rom.coverFormat! : 'image/png',
        // A personal file, so it is kept out of shared caches. A change must show at once, so revalidation is forced too.
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('cover download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
