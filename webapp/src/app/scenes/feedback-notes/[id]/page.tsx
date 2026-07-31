// /scenes/feedback-notes/[id] — 피드백 노트 단건 뷰 (owner 전용). LLM 원문 유지. (#9)

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';
import { connectToDB } from '@/lib/db';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import CommentContent from '@/components/comment-content';

export const dynamic = 'force-dynamic';

const ENDING_LABEL: Record<string, string> = {
  ascension: '승천',
  revolution: '혁명',
  harmony: '조화',
  fall: '몰락',
  petrification: '석화',
  sylvan_bond: '숲의 유대',
};

export default async function FeedbackNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  const { id } = await params;

  await connectToDB();
  let note;
  try {
    note = await WebAdventureFeedbackNote.findById(id).lean();
  } catch {
    notFound();
  }
  if (!note || note.isDeleted || note.ownerEmail !== owner.email) notFound();

  const endingLabel = ENDING_LABEL[note.endingId] ?? note.endingId;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <Link href="/scenes/feedback-notes" className="text-sm text-indigo-600 hover:underline">
        ← 피드백 노트 목록
      </Link>

      <header className="mt-3 mb-6">
        <div className="text-xs text-gray-400">
          #{note.runIndex} · {endingLabel} · {note.status}
        </div>
        <h1 className="text-2xl font-bold mt-1">{note.title || '(제목 없음)'}</h1>
      </header>

      {note.status !== 'ready' ? (
        <p className="text-gray-500">
          {note.status === 'failed'
            ? `생성 실패: ${note.error || '알 수 없는 오류'}`
            : '아직 생성 중입니다. 잠시 후 다시 확인하세요.'}
        </p>
      ) : (
        <>
          <section className="mb-8 leading-relaxed">
            <CommentContent content={note.narrative} />
          </section>
          {note.authorNote && (
            <section className="mt-8 border-t pt-6">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">작가 노트</h2>
              <div className="leading-relaxed bg-amber-50 rounded-lg p-4">
                <CommentContent content={note.authorNote} />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
