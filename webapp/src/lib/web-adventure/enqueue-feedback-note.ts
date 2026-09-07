// The shared logic for queueing a feedback note - used by both end-run (web) and app-end-run (the app). (#9, #33)
//
// It queues the ending run (past-run). The note belongs to the author (the owner). It caps volume and prevents duplicates.
// Failures are swallowed - they must not block ending or submitting a run.

import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import { env } from '@/lib/env';

// Skipped once the queued and processing notes exceed this (preventing a flood on the slow single-worker queue).
export const MAX_PENDING_FEEDBACK_NOTES = 20;

/** A defensive cap on scenePath - strings only, at most 300 (guarding against infinite loops). */
export function capScenePath(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string').slice(0, 300)
    : [];
}

/** A defensive cap on the narrative log - strings only, at most 5000 entries of 4000 characters each (the 32k token budget is trimmed at generation time). */
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
    if (!ownerEmail) return; // With no author set there is nobody to attribute it to.
    if (!pastRun || logLen === 0) return; // With no narrative log there is nothing to flesh out.
    const pending = await WebAdventureFeedbackNote.countDocuments({
      status: { $in: ['queued', 'processing'] },
      isDeleted: { $ne: true },
    });
    if (pending >= MAX_PENDING_FEEDBACK_NOTES) return; // The volume cap.
    const exists = await WebAdventureFeedbackNote.findOne({
      pastRunId: pastRun._id,
      isDeleted: { $ne: true },
    }).lean();
    if (exists) return; // Preventing duplicates for the same run.
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
