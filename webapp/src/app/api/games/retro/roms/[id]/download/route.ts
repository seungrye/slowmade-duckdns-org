// /api/games/retro/roms/[id]/download - downloading an uploaded ROM (#194).
//
// There was no way to get it back from the UI. Moving devices or making a backup meant finding the original again.
//
// **With nothing to bundle, nothing is bundled.** With no patch and no parent sets the ROM is streamed as it is -
// no pointless zip and nothing loaded whole into memory (a ROM is up to 50MB).
//
// When bundling it **reuses `writeZip`** (`public/games/retro/rom-patch.js`) as it stands.
// It is the very code the player uses to build a patched ROM, so the results cannot diverge, and there is no reason
// to bring in a new zip writer (it stores uncompressed - ROMs and parent sets are already compressed, so nothing is lost).

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
 * The cap on the total held in memory while bundling.
 *
 * An arcade parent set has been 17MB, so the sum can grow. Over it, **it stops and says why** -
 * better than quietly eating memory until it dies.
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

/** RFC 5987 - carries a Korean filename in the header. The ASCII fallback is for older clients. */
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
  // A failed authorisation is a 404 too - a 401 would reveal "that id exists" (the same rule as the existing file routes).
  if (!email) return new NextResponse('Not Found', { status: 404 });

  const { id } = await ctx.params;
  if (!isRomId(id)) return new NextResponse('Not Found', { status: 404 });

  await connectToDB();
  const rom = await RetroRom.findOne({ _id: id, userEmail: email, isDeleted: { $ne: true } })
    .select('title filename objectKey size patches patchEnabled parentSets')
    .lean<LeanRom | null>();
  if (!rom) return new NextResponse('Not Found', { status: 404 });

  // The patch-selection rule lives in one place only - the UI, netplay and download must never point at different patches.
  const patch = rom.patchEnabled === false ? undefined : activeLeanPatch(rom);
  const parents = rom.parentSets ?? [];
  const romName = rom.filename || 'rom.bin';

  try {
    // ── With nothing to bundle, the original as it is.
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
