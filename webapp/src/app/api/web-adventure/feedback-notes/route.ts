// /api/web-adventure/feedback-notes — 피드백 노트 목록(GET) + 생성 enqueue(POST). (#9)
//
// owner 전용. POST 는 past-run 하나를 큐에 넣기만 하고(status=queued) 즉시 반환한다.
// 실제 LLM 생성은 워커(/feedback-notes/worker)가 큐에서 한 개씩 순차 처리한다
// (host cron 이 주기적으로 드레인 — 생성이 수 분이라 ~1분 트리거 지연은 무방).

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { apiSuccess, apiError } from '@/lib/api-response';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
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

export async function POST(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const body = await req.json();
  if (typeof body.pastRunId !== 'string') {
    return apiError('pastRunId 는 필수입니다.', 400);
  }

  await connectToDB();
  let run;
  try {
    run = await WebAdventurePastRun.findById(body.pastRunId).lean();
  } catch {
    return apiError('잘못된 pastRunId 입니다.', 400);
  }
  if (!run) {
    return apiError('회차를 찾을 수 없습니다.', 404);
  }

  // 큐에 적재(status=queued) — 워커가 순차 처리.
  const note = await WebAdventureFeedbackNote.create({
    ownerEmail: owner.email,
    pastRunId: run._id,
    sourceUserEmail: run.userEmail,
    runIndex: run.runIndex,
    endingId: run.endingId,
    finalSceneId: run.finalSceneId,
    status: 'queued',
  });

  return apiSuccess(note, 201);
}
