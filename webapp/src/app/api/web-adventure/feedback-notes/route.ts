// /api/web-adventure/feedback-notes - the feedback note list (GET). (#9, #11)
//
// Owner only. Creation happens **automatically on an ending** (end-run -> queued -> the worker) alone.
// Manual creation (a POST enqueue) was removed (following #11) - a note is created only from a play's ending.

import { NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { apiSuccess } from '@/lib/api-response';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  await connectToDB();
  const notes = await WebAdventureFeedbackNote.find({
    ownerEmail: owner.email,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return apiSuccess(notes);
}
