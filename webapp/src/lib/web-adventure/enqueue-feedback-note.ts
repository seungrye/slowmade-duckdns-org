// 피드백 노트 큐 적재 공용 로직 — end-run(웹)·app-end-run(앱)이 공유. (#9, #33)
//
// 엔딩 회차(past-run)를 큐에 적재. 노트 소유는 작가(owner). 볼륨 캡·중복 방지.
// 실패는 삼킨다 — 엔딩 종결/제출을 막지 않는다.

import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import { env } from '@/lib/env';

// 대기/처리 중 노트가 이 수를 넘으면 skip(느린 단일 워커 큐 폭주 방지).
export const MAX_PENDING_FEEDBACK_NOTES = 20;

/** scenePath 방어적 캡 — 문자열만, 최대 300(무한 루프 방어). */
export function capScenePath(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string').slice(0, 300)
    : [];
}

/** 서사 로그 방어적 캡 — 문자열만, 최대 5000항목·항목당 4000자(32k 토큰 예산 절삭은 생성 시). */
export function capLog(v: unknown): string[] {
  return Array.isArray(v)
    ? v
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 5000)
        .map((s) => s.slice(0, 4000))
    : [];
}

export async function enqueueFeedbackNote(
  pastRun: { _id: unknown; runIndex: number; endingId: string; finalSceneId: string } | null,
  sourceUserEmail: string,
  logLen: number,
): Promise<void> {
  try {
    const ownerEmail = env.ownerEmail.trim();
    if (!ownerEmail) return; // 작가 미설정이면 귀속 대상 없음.
    if (!pastRun || logLen === 0) return; // 서사 로그 없으면 살 붙일 게 없음.
    const pending = await WebAdventureFeedbackNote.countDocuments({
      status: { $in: ['queued', 'processing'] },
      isDeleted: { $ne: true },
    });
    if (pending >= MAX_PENDING_FEEDBACK_NOTES) return; // 볼륨 캡.
    const exists = await WebAdventureFeedbackNote.findOne({
      pastRunId: pastRun._id,
      isDeleted: { $ne: true },
    }).lean();
    if (exists) return; // 같은 회차 중복 방지.
    await WebAdventureFeedbackNote.create({
      ownerEmail,
      pastRunId: pastRun._id,
      sourceUserEmail,
      runIndex: pastRun.runIndex,
      endingId: pastRun.endingId,
      finalSceneId: pastRun.finalSceneId,
      status: 'queued',
    });
  } catch {
    /* 자동생성 실패 삼킴 */
  }
}
