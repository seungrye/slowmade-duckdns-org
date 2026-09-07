// /api/web-adventure/migrate-from-local - migrating localStorage on logging in (#240).
//
// When the client sends localStorage's save plus past_runs payload right after login:
//   - with no server save -> upsert.
//   - with a server save, it depends on mode:
//       mode unset or 'keep' -> migrated:false, reason:'server_exists'
//       mode='force' -> the server save is overwritten.
//   - past_runs is unique on (userEmail, runIndex), so only entries *not colliding with an existing runIndex* are insertMany'd.

import { NextRequest } from 'next/server';
import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import WebAdventureSave from '@/models/web-adventure-save';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

interface AutoSavePayload {
  runIndex: number;
  currentSceneId: string;
  character: unknown;
}

interface PastRunPayload {
  runIndex: number;
  endingId: string;
  finalSceneId: string;
  character?: unknown;
  completedAt?: string;
}

import { hydrateCharacterSnapshot } from '@/lib/web-adventure/hydrate-character';

interface MigratePayload {
  save?: AutoSavePayload;
  pastRuns?: PastRunPayload[];
  mode?: 'keep' | 'force';
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('로그인이 필요합니다.', 401);
  }

  const body = (await req.json()) as MigratePayload;
  if (!body.save && (!body.pastRuns || body.pastRuns.length === 0)) {
    return apiError('save 또는 pastRuns 중 하나는 필요합니다.', 400);
  }

  await connectToDB();
  const userEmail = session.user.email;
  const mode = body.mode ?? 'keep';

  let migrated = false;
  let reason: string | undefined;

  // 1. Migrating the save
  if (body.save) {
    const existing = await WebAdventureSave.findOne({ userEmail }).lean();
    if (existing && mode !== 'force') {
      reason = 'server_exists';
    } else {
      await WebAdventureSave.findOneAndUpdate(
        { userEmail },
        {
          userEmail,
          runIndex: body.save.runIndex,
          character: body.save.character,
          currentSceneId: body.save.currentSceneId,
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      migrated = true;
    }
  }

  // 2. Migrating pastRuns - only those not colliding with an existing runIndex.
  let pastRunsMigrated = 0;
  if (body.pastRuns && body.pastRuns.length > 0) {
    const existingRuns = await WebAdventurePastRun.find({ userEmail })
      .lean();
    const existingIndexes = new Set(
      (existingRuns as Array<{ runIndex: number }>).map((r) => r.runIndex),
    );
    const toInsert = body.pastRuns
      .filter((r) => !existingIndexes.has(r.runIndex))
      .map((r) => ({
        userEmail,
        runIndex: r.runIndex,
        endingId: r.endingId,
        finalSceneId: r.finalSceneId,
        // #289 - compatibility with an old localStorage character snapshot (correcting protagonist and stigmaErosion).
        character: hydrateCharacterSnapshot(r.character),
        completedAt: r.completedAt ? new Date(r.completedAt) : new Date(),
      }));
    if (toInsert.length > 0) {
      try {
        await WebAdventurePastRun.insertMany(toInsert, { ordered: false });
        pastRunsMigrated = toInsert.length;
      } catch {
        /* 일부 중복(race) 일 수 있음 — ordered:false 라 가능한 것만 적용 */
      }
    }
  }

  return apiSuccess({ migrated, reason, pastRunsMigrated });
}
