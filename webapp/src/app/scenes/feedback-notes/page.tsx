// /scenes/feedback-notes — 작가(owner) 전용 피드백 노트 목록. (#9, #11)
// 노트는 엔딩 시 자동 생성된다(수동 생성 없음). 이 페이지는 열람·삭제만.

import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';
import { connectToDB } from '@/lib/db';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import FeedbackNotesClient from './feedback-notes-client';

export const dynamic = 'force-dynamic';

export default async function FeedbackNotesPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();

  await connectToDB();
  const noteDocs = await WebAdventureFeedbackNote.find({
    ownerEmail: owner.email,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const notes = JSON.parse(JSON.stringify(noteDocs));
  return <FeedbackNotesClient initialNotes={notes} />;
}
