// /scenes/feedback-notes - the author's (owner's) feedback note list. (#9, #11)
// Notes are generated automatically at an ending (there is no manual creation). This page only views and deletes.

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
