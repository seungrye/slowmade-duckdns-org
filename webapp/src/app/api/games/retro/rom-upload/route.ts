import { createHash } from 'node:crypto';
import { pickInheritablePatch } from '@/lib/retro/inherit-patch';
// ROM upload (#109).
//
// **Why the path is separate from the list (`../roms`)**: this route has to be excluded from `src/middleware.ts`'s
// matcher. When middleware matches, Next buffers the request body and caps it at 10MB by default, truncating a large ROM.
// But excluding by prefix would drag `roms/[id]/file` (the download) out with it and lose its security headers. So
// upload alone lives on a separate path - `api/attachment/upload` is split for the same reason.
//
// An uploaded ROM can be seen and run **only by whoever uploaded it**. No public `/s3/` URL is created, and the file
// is served only through the authenticated `roms/[id]/file` proxy.

import { NextRequest, NextResponse } from 'next/server';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { validateRomUpload } from '@/lib/retro/rom-upload';
import { classifyRomSet } from '@/lib/retro/romset';
import { isArcade } from '@/lib/retro/platforms';
import { toRomDto, type LeanRom } from '@/lib/retro/rom-dto';
import { evaluateAndGrant } from '@/lib/achievements';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

const KEY_PREFIX = 'retro-roms';

export async function POST(req: NextRequest) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const formData = await req.formData();
  // An arcade split set uploads the parent and clone together (#143). Which is the game is decided by name.
  const all = formData.getAll('file').filter((f): f is File => f instanceof File);
  if (all.length === 0) return apiError('롬 파일이 없습니다.', 400);

  const picked = classifyRomSet(all.map((f) => f.name));
  const file = all.find((f) => f.name === picked.game) ?? all[0];
  const parents = all.filter((f) => f !== file);

  const platform = formData.get('platform');

  const check = validateRomUpload({
    filename: file.name,
    size: file.size,
    platform: typeof platform === 'string' && platform ? platform : undefined,
  });
  if (!check.ok) {
    // Only an over-size gives 413 - matching what nginx and the browser return, so the client handles one case.
    return apiError(check.reason, check.reason.includes('너무 큽니다') ? 413 : 400);
  }

  // Uploading several outside arcade is most likely a mistake - it is not discarded quietly.
  if (parents.length > 0 && !isArcade(check.platform)) {
    return apiError('이 기종은 파일을 하나만 올립니다.', 400);
  }

  const safeName = file.name.replace(/[/\\]/g, '_').slice(0, 200) || 'rom';
  const key = `${KEY_PREFIX}/${randomUUID()}-${safeName}`; // A random prefix - it prevents key guessing
  const parentSets: { name: string; size: number; objectKey: string; sha256: string }[] = [];
  // The basis for separating netplay rooms (#188) - differing bytes silently break lockstep synchronisation.
  // The bytes are in hand for the upload anyway, so hashing here costs nothing.
  let romSha = '';

  try {
    const romBuf = Buffer.from(await file.arrayBuffer());
    romSha = createHash('sha256').update(romBuf).digest('hex');
    await minioClient.putObject(env.minio.bucket, key, romBuf);
    // The parents are stored **from the general upward** - they are placed into the core's filesystem in that order at run time.
    for (const name of picked.parents) {
      const pf = parents.find((f) => f.name === name);
      if (!pf) continue;
      const pName = pf.name.replace(/[/\\]/g, '_').slice(0, 200) || 'parent';
      const pKey = `${KEY_PREFIX}/${randomUUID()}-${pName}`;
      const pBuf = Buffer.from(await pf.arrayBuffer());
      await minioClient.putObject(env.minio.bucket, pKey, pBuf);
      parentSets.push({
        name: pName, size: pf.size, objectKey: pKey,
        sha256: createHash('sha256').update(pBuf).digest('hex'),
      });
    }
  } catch (err) {
    console.error('rom upload failed:', err);
    return apiError('롬 업로드에 실패했습니다.', 500);
  }

  try {
    await connectToDB();
    const doc = await RetroRom.create({
      userEmail: authed.email,
      title: check.title,
      platform: check.platform,
      core: check.core,
      filename: safeName,
      size: file.size,
      objectKey: key,
      sha256: romSha,
      parentSets,
    });
    // When someone has already uploaded the same ROM with a patch attached, it is inherited (#190).
    // It happens **after the document is created** - a convenience must not fail the upload itself.
    const inherited = await inheritPatchIfAny(romSha, authed.email, String(doc._id));
    await evaluateAndGrant(authed.email);
    return apiSuccess(toRomDto((inherited ?? doc) as unknown as LeanRom), 201);
  } catch (err) {
    // If the record failed, the file is left orphaned where nobody can find it - so it is rolled back.
    console.error('rom record failed, rolling back objects:', err);
    for (const k of [key, ...parentSets.map((p) => p.objectKey)]) {
      try {
        await minioClient.removeObject(env.minio.bucket, k);
      } catch (cleanupErr) {
        console.error('rom rollback failed:', cleanupErr);
      }
    }
    return apiError('롬 정보를 저장하지 못했습니다.', 500);
  }
}

/** Where an inherited patch is stored - the same prefix the `rom-patch` route uses. */
const PATCH_KEY_PREFIX = 'retro-patches';

/**
 * Inherits the live patch of **someone else** who already uploaded the same ROM (byte-identical) (#190).
 *
 * IPS has no checksum of its own, so the file alone cannot say which ROM it targets. The fact that whoever uploaded
 * first attached it to **exactly that hash of a ROM** is itself the evidence of compatibility.
 *
 * **The bytes are copied.** Merely referencing the original would silently change this game's content the moment they
 * delete their patch - the screen and the netplay room number alike. `copyObject` is a server-side copy, so nothing is downloaded.
 *
 * **Failures are swallowed.** It is a convenience, and the upload is already done.
 *
 * @returns the updated document when a patch was attached, or null (the caller then uses the original document).
 */
async function inheritPatchIfAny(romSha: string, email: string, romId: string) {
  if (!romSha) return null;
  try {
    const others = await RetroRom.find({
      sha256: romSha,
      userEmail: { $ne: email },
      isDeleted: { $ne: true },
    })
      .select('patches')
      .lean<{ patches?: { name: string; format: string; size: number; objectKey?: string; sha256?: string; isDeleted?: boolean }[] }[]>();

    const candidates = others.flatMap((o) => (o.patches ?? []).filter((p) => !p.isDeleted));
    const picked = pickInheritablePatch(candidates);
    if (!picked) return null;

    // The copy belongs to this user - a new key is generated.
    const destKey = `${PATCH_KEY_PREFIX}/${randomUUID()}-${picked.name}`;
    await minioClient.copyObject(
      env.minio.bucket,
      destKey,
      `/${env.minio.bucket}/${picked.objectKey}`,
    );

    // The shape matches what the rom-patch route creates - diverging would mean fixing only one of them later.
    // patchEnabled keeps the schema's default (on) - anyone who does not want it can switch it off once on the card.
    return await RetroRom.findByIdAndUpdate(
      romId,
      { $push: { patches: {
        name: picked.name, format: picked.format, size: picked.size,
        objectKey: destKey, sha256: picked.sha256,
      } } },
      { new: true },
    ).lean();
  } catch (err) {
    console.error('패치 물려주기 실패(업로드는 그대로 성공):', err);
    return null;
  }
}
