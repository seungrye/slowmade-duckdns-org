// 내 롬 지우기 (#109) — **soft delete**.
//
// 플래그만 세우고 MinIO 오브젝트도 남긴다. 실수로 지운 롬을 되살릴 수 있어야 하고,
// 이 저장소의 삭제는 전부 이 방식이다.

import { NextResponse } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { isRomId } from '@/lib/retro/rom-dto';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  // id 형식을 먼저 본다 — 아무 문자열이나 넘기면 mongoose 가 CastError 로 500 을 낸다.
  if (!isRomId(id)) return apiError('롬을 찾을 수 없습니다.', 404);

  await connectToDB();
  // userEmail 을 조건에 함께 넣어 남의 롬은 애초에 걸리지 않게 한다.
  const res = await RetroRom.updateOne(
    { _id: id, userEmail: authed.email, isDeleted: { $ne: true } },
    { $set: { isDeleted: true } },
  );

  // 없는 롬과 남의 롬을 같은 404 로 답한다 — 존재 여부를 알려 주지 않는다.
  if (!res.matchedCount) return apiError('롬을 찾을 수 없습니다.', 404);
  return apiSuccess({ id });
}

/**
 * 패치 적용 여부 토글 (#116) — 카드의 체크박스.
 *
 * 지금은 `patchEnabled` 하나만 받는다. 다른 필드를 받게 되면 화이트리스트를 늘릴 것 —
 * 요청 본문을 그대로 `$set` 에 넘기면 무엇이든 덮어쓸 수 있게 된다.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  if (!isRomId(id)) return apiError('롬을 찾을 수 없습니다.', 404);

  const body = await req.json().catch(() => null);
  if (typeof body?.patchEnabled !== 'boolean') return apiError('잘못된 요청입니다.', 400);

  await connectToDB();
  const res = await RetroRom.updateOne(
    { _id: id, userEmail: authed.email, isDeleted: { $ne: true } },
    { $set: { patchEnabled: body.patchEnabled } },
  );

  if (!res.matchedCount) return apiError('롬을 찾을 수 없습니다.', 404);
  return apiSuccess({ patchEnabled: body.patchEnabled });
}
