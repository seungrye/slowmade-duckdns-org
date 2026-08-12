// /api/web-adventure/feedback-notes/worker — 피드백 노트 큐 워커. (#9)
//
// 한 번 호출될 때마다 큐에서 **한 개**만 순차 처리한다(shim 단일 슬롯). host cron 이
// 주기적으로(예: 1분) 호출해 큐를 드레인한다. 재시작으로 끊긴 processing 은 되살린다.
//
// 인증: 내부 키(x-worker-key = env.llmWorkerKey, cron 용) 또는 owner 세션. 그 외 404.
//
// 흐름:
//   1) stale processing(claimedAt 오래됨) → queued 복구 (재시작 유실 방지)
//   2) 살아있는 processing 있으면 no-op 반환 (한 번에 하나 = 순차)
//   3) 가장 오래된 queued 원자적 claim(→processing)
//   4) past-run 입력으로 LLM 생성 → 성공: ready 채움 / 실패: 재시도 or failed

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { apiSuccess } from '@/lib/api-response';
import { env } from '@/lib/env';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { generateFeedbackNote, ENDING_LABEL } from '@/lib/web-adventure/feedback-note';
import { STALE_MS, GEN_TIMEOUT_MS } from '@/lib/web-adventure/feedback-worker-timing';

const MAX_ATTEMPTS = 3;

// 이 라우트는 생성 대기로 오래 걸릴 수 있음.
export const maxDuration = 2820;

async function authorize(req: NextRequest): Promise<boolean> {
  const key = env.llmWorkerKey.trim();
  if (key && req.headers.get('x-worker-key') === key) return true;
  const owner = await requireOwner();
  return !(owner instanceof NextResponse);
}

export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  await connectToDB();

  // 1) stale 복구 — 실행 결과를 기록하지 못한 시도는 **시도로 치지 않는다** (#101).
  //    배포로 인스턴스가 죽으면 catch 도 돌지 못해 processing 인 채 남는다. 종전에는 claim
  //    시점에 올려 둔 attempts 가 그대로여서, 배포 세 번이면 사람이 손대야 하는 failed 가
  //    됐다(2026-08-12 사고). 되돌릴 때 attempts 를 함께 깎는다.
  const staleCutoff = new Date(Date.now() - STALE_MS);
  await WebAdventureFeedbackNote.updateMany(
    { status: 'processing', claimedAt: { $lt: staleCutoff }, attempts: { $gt: 0 } },
    { $set: { status: 'queued', claimedAt: null }, $inc: { attempts: -1 } },
  );

  // 2) 순차 보장 — 살아있는 processing 있으면 skip.
  const processing = await WebAdventureFeedbackNote.countDocuments({ status: 'processing' });
  if (processing > 0) {
    return apiSuccess({ state: 'busy' });
  }

  // 3) 가장 오래된 queued 를 원자적으로 claim.
  const note = await WebAdventureFeedbackNote.findOneAndUpdate(
    { status: 'queued' },
    { status: 'processing', claimedAt: new Date(), $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  );
  if (!note) {
    return apiSuccess({ state: 'idle' });
  }

  // 4) 입력(past-run) 로드 → 생성.
  try {
    const run = await WebAdventurePastRun.findById(note.pastRunId).lean();
    if (!run) throw new Error('원천 회차(past-run)를 찾을 수 없습니다.');

    const result = await generateFeedbackNote(
      {
        endingId: run.endingId,
        finalSceneId: run.finalSceneId,
        scenePath: run.scenePath ?? [],
        log: run.log ?? [],
        character: run.character
          ? {
              protagonist: run.character.protagonist,
              ability: run.character.ability,
              stigmaErosion: run.character.stigmaErosion,
              hp: run.character.hp,
              maxHp: run.character.maxHp,
              inventory: run.character.inventory,
            }
          : null,
      },
      { signal: AbortSignal.timeout(GEN_TIMEOUT_MS) },
    );

    // AI 는 작가 노트(제안/개선안)만 생성. 서사는 엔딩 원본 로그를 그대로, 제목은 엔딩명.
    note.authorNote = result.authorNote;
    note.narrative = (run.log ?? []).join('\n');
    note.title = `${ENDING_LABEL[run.endingId] ?? run.endingId} 회차 #${run.runIndex}`;
    note.voice = run.voice ?? '';
    note.status = 'ready';
    note.error = '';
    note.claimedAt = null;
    await note.save();
    return apiSuccess({ state: 'done', id: String(note._id) });
  } catch (err) {
    const message = (err instanceof Error ? err.message : '생성 실패').slice(0, 500);
    // 재시도 가능하면 queued 로 되돌리고, 한도 초과면 failed.
    if (note.attempts >= MAX_ATTEMPTS) {
      note.status = 'failed';
      note.error = message;
    } else {
      note.status = 'queued';
      note.error = message;
    }
    note.claimedAt = null;
    await note.save();
    return apiSuccess({ state: note.status === 'failed' ? 'failed' : 'retry', error: message });
  }
}
