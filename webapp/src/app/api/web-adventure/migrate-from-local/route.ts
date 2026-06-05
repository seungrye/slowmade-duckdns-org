// /api/web-adventure/migrate-from-local — 비로그인 → 로그인 시 localStorage 이전 (#240).
//
// 클라이언트가 로그인 직후 localStorage 의 save + past_runs 페이로드를 전송하면
//   - 서버 save 가 없으면 → upsert.
//   - 서버 save 가 있으면 mode 에 따라 처리:
//       mode 미지정 또는 'keep' → migrated:false, reason:'server_exists'
//       mode='force' → 서버 save 덮어쓰기.
//   - past_runs 는 (userEmail, runIndex) unique 라 *기존 runIndex 와 안 겹치는* 항목만 insertMany.

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
  character: unknown;
  completedAt?: string;
}

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

  // 1. save 이전
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

  // 2. pastRuns 이전 — 기존 runIndex 와 안 겹치는 것만.
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
        character: r.character,
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
