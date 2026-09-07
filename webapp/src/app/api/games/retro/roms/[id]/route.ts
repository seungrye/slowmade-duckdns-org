// Deleting my ROM (#109) - **a soft delete**.
//
// It only sets a flag and leaves the MinIO object too. A ROM deleted by accident must be recoverable,
// and every deletion in this repo works this way.

import { NextResponse } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { isRomId } from '@/lib/retro/rom-dto';
import { normalizeRomTitle } from '@/lib/retro/rom-edit';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  // The id's format is checked first - any old string makes mongoose throw a CastError and return 500.
  if (!isRomId(id)) return apiError('롬을 찾을 수 없습니다.', 404);

  await connectToDB();
  // userEmail is put in the condition so someone else's ROM never matches in the first place.
  const res = await RetroRom.updateOne(
    { _id: id, userEmail: authed.email, isDeleted: { $ne: true } },
    { $set: { isDeleted: true } },
  );

  // A missing ROM and someone else's answer with the same 404 - existence is not revealed.
  if (!res.matchedCount) return apiError('롬을 찾을 수 없습니다.', 404);
  return apiSuccess({ id });
}

/**
 * What can be edited from the card - the patch-applied toggle (#116) and the title (#122).
 *
 * **It is a whitelist.** Passing the request body straight into `$set` would let anything be overwritten.
 * When adding a field, add its branch here too.
 *
 * Changing the title leaves the original filename (`filename`) alone - it is the name used when downloading, and
 * keeping the display name separate from the original is better.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  const { id } = await ctx.params;
  if (!isRomId(id)) return apiError('롬을 찾을 수 없습니다.', 404);

  const body = await req.json().catch(() => null);
  const update: { patchEnabled?: boolean; title?: string } = {};

  if (body && 'patchEnabled' in body) {
    if (typeof body.patchEnabled !== 'boolean') return apiError('잘못된 요청입니다.', 400);
    update.patchEnabled = body.patchEnabled;
  }
  if (body && 'title' in body) {
    const title = normalizeRomTitle(body.title);
    if (!title) return apiError('제목을 입력해 주세요.', 400);
    update.title = title;
  }

  if (!Object.keys(update).length) return apiError('잘못된 요청입니다.', 400);

  await connectToDB();
  const res = await RetroRom.updateOne(
    { _id: id, userEmail: authed.email, isDeleted: { $ne: true } },
    { $set: update },
  );

  if (!res.matchedCount) return apiError('롬을 찾을 수 없습니다.', 404);
  return apiSuccess(update);
}
