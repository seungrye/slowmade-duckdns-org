// /scenes/feedback-notes — 작가(owner) 전용 피드백 노트 목록 + 회차에서 생성. (#9)

import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';
import { connectToDB } from '@/lib/db';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import FeedbackNotesClient from './feedback-notes-client';

export const dynamic = 'force-dynamic';

export default async function FeedbackNotesPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  const ownerEmail = owner.email;

  await connectToDB();
  const noteDocs = await WebAdventureFeedbackNote.find({
    ownerEmail,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  // owner 자신이 플레이한 회차 중 노트 생성 후보(최근순).
  const runDocs = await WebAdventurePastRun.find({ userEmail: ownerEmail })
    .sort({ completedAt: -1 })
    .limit(50)
    .lean();

  const notes = JSON.parse(JSON.stringify(noteDocs));
  const runs = JSON.parse(JSON.stringify(runDocs));
  return <FeedbackNotesClient initialNotes={notes} runs={runs} />;
}
