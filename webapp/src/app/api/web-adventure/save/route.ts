// /api/web-adventure/save - saving and loading the current progress (#237).
//
// The week 5 milestone - autosave unified across logged-in and logged-out.
// GET  -> the logged-in user's save (data:null when absent).
// POST -> an upsert of { userEmail, runIndex, character, currentSceneId }.
// Logged out -> 401 (the client uses its localStorage fallback).
//
// The incoming character's flags is a client JSON object, serialised automatically into a mongoose
// Map (mongoose supports converting a plain object into a Map).

import { NextRequest } from 'next/server';
import { flagsForStore } from '@/lib/web-adventure/flags';
import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import WebAdventureSave from '@/models/web-adventure-save';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('로그인이 필요합니다.', 401);
  }
  await connectToDB();
  const save = await WebAdventureSave.findOne({ userEmail: session.user.email }).lean();
  return apiSuccess(save ?? null);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('로그인이 필요합니다.', 401);
  }
  const body = await req.json();

  // Validating the required fields
  if (
    typeof body.runIndex !== 'number' ||
    !body.character ||
    typeof body.currentSceneId !== 'string'
  ) {
    return apiError('runIndex, character, currentSceneId 는 필수입니다.', 400);
  }

  await connectToDB();
  try {
    const saved = await WebAdventureSave.findOneAndUpdate(
      { userEmail: session.user.email },
      {
        userEmail: session.user.email,
        runIndex: body.runIndex,
        // #356 - the dotted keys in flags (world.*) made saving fail outright.
        character: { ...(body.character as Record<string, unknown>), flags: flagsForStore((body.character as { flags?: unknown }).flags) },
        currentSceneId: body.currentSceneId,
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return apiSuccess(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : '저장 실패';
    return apiError(message, 400);
  }
}
