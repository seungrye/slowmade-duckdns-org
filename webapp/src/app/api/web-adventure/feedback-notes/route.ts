// /api/web-adventure/feedback-notes — 피드백 노트 목록(GET). (#9, #11)
//
// owner 전용. 생성은 **엔딩 시 자동**(end-run → 큐 적재 → 워커)만 사용한다.
// 수동 생성(POST enqueue)은 제거됨(#11 후속) — 노트는 플레이 엔딩에서만 자동 생성.

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
