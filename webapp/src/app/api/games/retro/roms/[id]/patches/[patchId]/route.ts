// Deleting a patch (#112) - a soft delete. It sets a flag rather than removing it from the array.

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
  // The format is checked first - any old string makes mongoose throw a CastError and return 500.
  if (!isRomId(id) || !isRomId(patchId)) return apiError('패치를 찾을 수 없습니다.', 404);

  await connectToDB();
  const res = await RetroRom.updateOne(
    // userEmail is put in the condition so someone else's ROM never matches in the first place.
    { _id: id, userEmail: authed.email, isDeleted: { $ne: true }, 'patches._id': patchId },
    { $set: { 'patches.$.isDeleted': true } },
  );

  if (!res.matchedCount) return apiError('패치를 찾을 수 없습니다.', 404);
  return apiSuccess({ id: patchId });
}
