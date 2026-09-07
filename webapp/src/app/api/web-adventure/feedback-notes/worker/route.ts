// /api/web-adventure/feedback-notes/worker - the feedback-note queue worker. (#9)
//
// Each call processes **one** item from the queue, in order (the shim has a single slot). A host cron
// calls it periodically (every minute, say) to drain the queue. A processing item cut off by a restart is revived.
//
// Authentication: an internal key (x-worker-key = env.llmWorkerKey, for cron) or an owner session. Anything else gets 404.
//
// The flow:
//   1) a stale processing item (an old claimedAt) -> returned to queued (preventing loss on a restart)
//   2) with a live processing item, return a no-op (one at a time = sequential)
//   3) atomically claim the oldest queued item (-> processing)
//   4) generate with the LLM from the past-run input -> on success fill in ready; on failure retry or mark failed

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { apiSuccess } from '@/lib/api-response';
import { env } from '@/lib/env';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import WebAdventureScene from '@/models/web-adventure-scene';
import { generateFeedbackNote } from '@/lib/web-adventure/feedback-note';
import { endingLabel } from '@/content/web-adventure/endings';
import { STALE_MS, GEN_TIMEOUT_MS } from '@/lib/web-adventure/feedback-worker-timing';

const MAX_ATTEMPTS = 3;

// This route can take a long time waiting for the generation.
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

  // 1) Stale recovery - an attempt that never recorded its outcome **does not count as an attempt** (#101).
  //    When a deploy kills the instance, even the catch cannot run and it is left processing. Previously the attempts
  //    raised at claim time stayed as they were, so three deploys made it a failed note needing manual
  //    intervention (the 2026-08-12 incident). Returning it also decrements attempts.
  const staleCutoff = new Date(Date.now() - STALE_MS);
  await WebAdventureFeedbackNote.updateMany(
    { status: 'processing', claimedAt: { $lt: staleCutoff }, attempts: { $gt: 0 } },
    { $set: { status: 'queued', claimedAt: null }, $inc: { attempts: -1 } },
  );

  // 2) Guaranteeing order - skipped while a live processing item exists.
  const processing = await WebAdventureFeedbackNote.countDocuments({ status: 'processing' });
  if (processing > 0) {
    return apiSuccess({ state: 'busy' });
  }

  // 3) Atomically claim the oldest queued item.
  const note = await WebAdventureFeedbackNote.findOneAndUpdate(
    { status: 'queued' },
    { status: 'processing', claimedAt: new Date(), $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true },
  );
  if (!note) {
    return apiSuccess({ state: 'idle' });
  }

  // 4) Load the input (the past-run) and generate.
  try {
    const run = await WebAdventurePastRun.findById(note.pastRunId).lean();
    if (!run) throw new Error('원천 회차(past-run)를 찾을 수 없습니다.');

    // #163 - the full scene list (titles only) is sent along. A note sees one run's log alone, so without this it
    //   declares scenes that run did not pass "absent".
    const sceneIndex = (await WebAdventureScene.find({ isDeleted: { $ne: true } })
      .select('id title')
      .lean()) as unknown as Array<{ id: string; title?: string }>;

    const result = await generateFeedbackNote(
      {
        sceneIndex,
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

    // The AI writes only the author's note (suggestions and improvements). The narrative is the ending's original log as it stands, and the title the ending's name.
    note.authorNote = result.authorNote;
    note.narrative = (run.log ?? []).join('\n');
    note.title = `${endingLabel(run.endingId)} 회차 #${run.runIndex}`;
    note.voice = run.voice ?? '';
    note.status = 'ready';
    note.error = '';
    note.claimedAt = null;
    await note.save();
    return apiSuccess({ state: 'done', id: String(note._id) });
  } catch (err) {
    const message = (err instanceof Error ? err.message : '생성 실패').slice(0, 500);
    // If a retry is possible it returns to queued; past the limit it is failed.
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
