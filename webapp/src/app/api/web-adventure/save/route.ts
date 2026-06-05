// /api/web-adventure/save — 현재 진행도 저장/불러오기 (#237).
//
// 5주차 milestone — 자동 저장 + 로그인/비로그인 통합.
// GET  → 로그인된 사용자의 save (없으면 data:null).
// POST → upsert: { userEmail, runIndex, character, currentSceneId } 갱신.
// 비로그인 → 401 (클라이언트가 localStorage fallback 사용).
//
// 입력 character 의 flags 는 client JSON object 이며, mongoose Map 으로
// 자동 직렬화된다 (mongoose 가 plain object → Map 변환을 지원).

import { NextRequest } from 'next/server';
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

  // 필수 필드 검증
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
        character: body.character,
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
