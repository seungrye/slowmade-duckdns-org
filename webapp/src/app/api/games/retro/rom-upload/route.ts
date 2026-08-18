import { createHash } from 'node:crypto';
import { pickInheritablePatch } from '@/lib/retro/inherit-patch';
// 롬 올리기 (#109).
//
// 목록(`../roms`)과 **경로를 나눈 이유**: 이 라우트는 `src/middleware.ts` 의 matcher 에서 빠져야
// 한다. middleware 가 매칭되면 Next 가 요청 본문을 버퍼링하며 기본 10MB 로 제한해 큰 롬이 잘린다.
// 그런데 접두사로 빼면 `roms/[id]/file`(내려받기)까지 딸려 빠져 보안 헤더가 사라진다. 그래서
// 업로드만 다른 경로에 둔다 — `api/attachment/upload` 가 같은 이유로 분리돼 있다.
//
// 올린 롬은 **올린 사람만** 보고 실행할 수 있다. 공개 `/s3/` URL 을 만들지 않고, 파일은
// `roms/[id]/file` 인증 프록시로만 내려준다.

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
  // 아케이드 분할 셋은 부모·클론을 함께 올린다 (#143). 어느 쪽이 게임인지는 이름으로 가른다.
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
    // 크기 초과만 413 — nginx·브라우저가 내는 413 과 의미를 맞춰 클라이언트가 한 갈래로 처리한다.
    return apiError(check.reason, check.reason.includes('너무 큽니다') ? 413 : 400);
  }

  // 아케이드가 아닌데 여러 개를 올린 건 실수일 가능성이 크다 — 조용히 버리지 않는다.
  if (parents.length > 0 && !isArcade(check.platform)) {
    return apiError('이 기종은 파일을 하나만 올립니다.', 400);
  }

  const safeName = file.name.replace(/[/\\]/g, '_').slice(0, 200) || 'rom';
  const key = `${KEY_PREFIX}/${randomUUID()}-${safeName}`; // 랜덤 프리픽스 — 키 추측 방지
  const parentSets: { name: string; size: number; objectKey: string; sha256: string }[] = [];
  // netplay 방을 가르는 근거 (#188) — 바이트가 다르면 락스텝 동기화가 조용히 어긋난다.
  // 어차피 업로드하려고 바이트를 들고 있으니 여기서 떠 두면 비용이 없다.
  let romSha = '';

  try {
    const romBuf = Buffer.from(await file.arrayBuffer());
    romSha = createHash('sha256').update(romBuf).digest('hex');
    await minioClient.putObject(env.minio.bucket, key, romBuf);
    // 부모는 **일반적인 것부터** 저장한다 — 실행할 때 코어 파일시스템에 그 순서로 놓는다.
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
    // 같은 롬을 이미 올린 사람이 있고 거기 패치가 붙어 있으면 물려준다 (#190).
    // **문서를 만든 뒤에** 한다 — 편의 기능이 업로드 자체를 실패시키면 안 된다.
    const inherited = await inheritPatchIfAny(romSha, authed.email, String(doc._id));
    return apiSuccess(toRomDto((inherited ?? doc) as unknown as LeanRom), 201);
  } catch (err) {
    // 기록이 안 됐으면 파일만 남아 아무도 못 찾는 고아가 된다 — 되돌린다.
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

/** 물려받은 패치를 담을 자리 — `rom-patch` 라우트와 같은 프리픽스를 쓴다. */
const PATCH_KEY_PREFIX = 'retro-patches';

/**
 * 같은 롬(바이트 동일)을 이미 올린 **다른 사람**의 살아 있는 패치를 물려준다 (#190).
 *
 * IPS 는 자체 체크섬이 없어 파일만으로는 대상 롬을 알 수 없다. 먼저 올린 사람이 **정확히 그
 * 해시의 롬**에 붙였다는 사실이 곧 호환성 근거다.
 *
 * **바이트를 복사한다.** 원본을 참조만 하면 그쪽이 패치를 지우는 순간 이쪽 게임 내용이 조용히
 * 바뀐다 — 화면도, 넷플레이 방 번호도. `copyObject` 는 서버측 복사라 내려받지 않는다.
 *
 * **실패는 삼킨다.** 편의 기능이고 업로드는 이미 끝났다.
 *
 * @returns 패치를 붙였으면 갱신된 문서, 아니면 null(호출측이 원래 문서를 쓴다).
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

    // 복사본은 이 사용자 것이다 — 키를 새로 뽑는다.
    const destKey = `${PATCH_KEY_PREFIX}/${randomUUID()}-${picked.name}`;
    await minioClient.copyObject(
      env.minio.bucket,
      destKey,
      `/${env.minio.bucket}/${picked.objectKey}`,
    );

    // 모양을 rom-patch 라우트가 만드는 것과 같게 둔다 — 갈리면 나중에 한쪽만 고치게 된다.
    // patchEnabled 는 스키마 기본값(켜짐) 그대로 — 원치 않으면 카드에서 한 번 끄면 된다.
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
