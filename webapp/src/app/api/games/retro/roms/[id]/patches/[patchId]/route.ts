// 패치 지우기 (#112) — soft delete. 배열에서 빼지 않고 플래그만 세운다.

import { NextResponse } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { isRomId } from '@/lib/retro/rom-dto';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; patchId: string }> }) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const { id, patchId } = await ctx.params;
  // 형식부터 본다 — 아무 문자열이나 넘기면 mongoose 가 CastError 로 500 을 낸다.
  if (!isRomId(id) || !isRomId(patchId)) return apiError('패치를 찾을 수 없습니다.', 404);

  await connectToDB();
  const res = await RetroRom.updateOne(
    // userEmail 을 조건에 함께 넣어 남의 롬은 애초에 걸리지 않게 한다.
    { _id: id, userEmail: authed.email, isDeleted: { $ne: true }, 'patches._id': patchId },
    { $set: { 'patches.$.isDeleted': true } },
  );

  if (!res.matchedCount) return apiError('패치를 찾을 수 없습니다.', 404);
  return apiSuccess({ id: patchId });
}
