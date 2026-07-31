// /api/web-adventure/feedback-notes/[id] — 단건 조회(GET) + 소프트 삭제(DELETE). (#9)
// owner 전용.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { apiSuccess, apiError } from '@/lib/api-response';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const { id } = await ctx.params;
  await connectToDB();
  let note;
  try {
    note = await WebAdventureFeedbackNote.findById(id).lean();
  } catch {
    return apiError('잘못된 id 입니다.', 400);
  }
  if (!note || note.isDeleted || note.ownerEmail !== owner.email) {
    return apiError('노트를 찾을 수 없습니다.', 404);
  }
  return apiSuccess(note);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const { id } = await ctx.params;
  await connectToDB();
  const note = await WebAdventureFeedbackNote.findOneAndUpdate(
    { _id: id, ownerEmail: owner.email, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: new Date() },
    { new: true },
  );
  if (!note) {
    return apiError('노트를 찾을 수 없습니다.', 404);
  }
  return apiSuccess({ deleted: true });
}
